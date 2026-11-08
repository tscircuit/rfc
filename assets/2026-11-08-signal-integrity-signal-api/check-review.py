"""Contract vectors, not native simulation. Read vendor data; never execute it.

Run: python3 assets/2026-11-08-signal-integrity-signal-api/check-review.py CORPUS
CORPUS is the external ibis-corpus directory; no vendor files are redistributed.
"""

import copy
import math
import re
import sys
from pathlib import Path


def close(actual, expected):
    if isinstance(expected, (list, tuple)):
        assert len(actual) == len(expected), (actual, expected)
        for a, e in zip(actual, expected):
            close(a, e)
    else:
        assert math.isclose(actual, expected, abs_tol=1e-12), (actual, expected)


def model(path, name):
    """Read only the named model's threshold fields, with IBIS SI voltage units."""
    fields = {"vinh", "vinl", "vth", "vth_min", "vth_max", "vinh_dc",
              "vinl_dc", "threshold_sensitivity", "reference_supply"}
    result, active, section = {}, False, ""
    with path.open(encoding="utf-8", errors="strict") as stream:
        for raw in stream:
            line = raw.partition("|")[0].strip()
            keyword = re.match(r"\[([^]]+)\]\s*(.*)", line)
            if keyword:
                section, tail = keyword.groups()
                section = section.lower()
                if section == "model":
                    if active:
                        break
                    active = tail == name
                if active and (section.endswith(" reference") or section == "voltage range"):
                    result[section] = numbers(tail)
            elif active and line and section in {"model", "model spec", "receiver thresholds"}:
                key, *values = line.replace("=", " ").split()
                key = key.lower()
                if key in fields:
                    result.setdefault(section, {})[key] = (
                        values[0].lower() if key == "reference_supply" else numbers(" ".join(values)))
    assert active, (path, name)
    return result


def numbers(text):
    def voltage(token):
        if token.upper() == "NA":
            return None
        match = re.fullmatch(r"([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)([mun]?)(?:V)?", token)
        assert match, token
        return float(match[1]) * {"": 1, "m": 1e-3, "u": 1e-6, "n": 1e-9}[match[2]]
    return [voltage(token) for token in text.split()]


def pick(values, corner, na_typ=False):
    if na_typ:
        pick(values, 0)  # Model Spec requires a usable typical value.
    value = values[0 if len(values) == 1 else corner] if values else None
    if value is None and values and corner and na_typ:
        value = values[0]  # IBIS [Model Spec] explicitly defines this default.
    if value is None:
        raise ValueError("unavailable field/corner")
    return value


def thresholds(data, corner):
    scalar, spec, rt = (data.get(key, {}) for key in ("model", "model spec", "receiver thresholds"))
    try:
        nominal = pick(rt.get("vth"), 0)
        high = pick(rt.get("vth_max", [nominal]), 0)
        low = pick(rt.get("vth_min", [nominal]), 0)
        correction = 0
        sensitivity, reference = rt.get("threshold_sensitivity"), rt.get("reference_supply")
        if sensitivity and not reference:
            raise ValueError("sensitivity needs reference")
        if corner:
            references = {"pullup_ref": "pullup reference", "pulldown_ref": "pulldown reference",
                          "power_clamp_ref": "power clamp reference", "gnd_clamp_ref": "gnd clamp reference",
                          "ext_ref": "external reference"}
            supply = data.get(references.get(reference))
            if supply is None and reference in {"pullup_ref", "power_clamp_ref"}:
                supply = data.get("voltage range")
            elif supply is None and reference in {"pulldown_ref", "gnd_clamp_ref"}:
                supply = [0]
            correction = pick(sensitivity, 0) * (pick(supply, corner) - pick(supply, 0))
        return (high + correction + pick(rt.get("vinh_dc"), 0),
                low + correction + pick(rt.get("vinl_dc"), 0))
    except ValueError:
        return tuple(pick(spec.get(key) if key in spec else scalar.get(key), corner, na_typ=key in spec)
                     for key in ("vinh", "vinl"))


def valid_intervals(wave, bit, vih=.9, vil=.6):
    intervals = []
    for (x, v), (y, w) in zip(wave, wave[1:]):
        p, q = (v - vih, w - vih) if bit else (vil - v, vil - w)
        if p < 0 and q < 0:
            continue
        a = x if p >= 0 else x + (y - x) * (-p) / (q - p)
        b = y if q >= 0 else x + (y - x) * (-p) / (q - p)
        if intervals and intervals[-1][1] == a:
            intervals[-1][1] = b
        else:
            intervals.append([a, b])
    return intervals


def margins(wave, bit=1, t=1, setup=.010, hold=.045):
    intervals = valid_intervals(wave, bit)
    if not intervals:
        duration = wave[-1][0]
        return (-duration - setup, -duration - hold), False
    a, b = min(intervals, key=lambda ab: (max(ab[0] - t, t - ab[1], 0), ab[0]))
    pair = t - a - setup, b - t - hold
    return pair, a <= t <= b and min(pair) >= 0


def reduce_reference(matrix, conductance=False):
    u = list(map(sum, matrix))
    d = sum(u)
    if conductance and d == 0 and all(value == 0 for value in u):
        return [row[:-1] for row in matrix[:-1]]
    if d <= 0:
        raise ValueError("nonpositive reference denominator")
    return [[value - u[i] * u[j] / d for j, value in enumerate(row[:-1])]
            for i, row in enumerate(matrix[:-1])]


corpus = Path(sys.argv[1]) / "x"
micron = model(corpus / "gh/gh_micron_u48b.ibs", "DQFULL_533")
winbond = model(corpus / "w631gg6mb_ibis.zip/W631GG6MB-12.ibs", "ODT_off")
am335x = model(corpus / "sprm552/sprm552c.ibs", "Model_1000")
assert "receiver thresholds" not in winbond and "receiver thresholds" not in am335x
for name, data, expected in [
    ("Micron DQFULL_533", micron, [(1.043, .757), (.993, .707), (1.093, .807)]),
    ("Winbond ODT_off", winbond, [(.9, .6)] * 3),
    ("AM335x Model_1000", am335x, [(.85, .65), (.8125, .6125), (.8875, .6875)]),
]:
    actual = [thresholds(data, corner) for corner in range(3)]
    close(actual, expected)
    print(name, "typ/min/max VIH,VIL (V):", actual)
assert not .740 <= thresholds(micron, 1)[1]
assert not 1.060 >= thresholds(micron, 2)[0]
rt = micron["receiver thresholds"]
assert .740 <= pick(rt["vth_min"], 0) + pick(rt["vinl_dc"], 0)
assert 1.060 >= pick(rt["vth_max"], 0) + pick(rt["vinh_dc"], 0)
print("G1: old-rule false passes (0.740 V min low, 1.060 V max high) both fail")
# Each unavailable conversion takes the DC pair, not a zero supply correction.
for missing in ("vth", "vinh_dc", "vinl_dc", "threshold_sensitivity", "reference_supply"):
    data = copy.deepcopy(micron)
    del data["receiver thresholds"][missing]
    close(thresholds(data, 1), (1.100, .600))
data = copy.deepcopy(micron)
del data["receiver thresholds"]["threshold_sensitivity"]
del data["receiver thresholds"]["reference_supply"]
close(thresholds(data, 0), (1.043, .757))
data = copy.deepcopy(micron)
del data["receiver thresholds"]["vth_min"]
del data["receiver thresholds"]["vth_max"]
close(thresholds(data, 1), (.975, .725))
data = copy.deepcopy(micron)
del data["pullup reference"]
close(thresholds(data, 1), (.993, .707))  # IBIS default: Voltage Range.
data["receiver thresholds"]["reference_supply"] = "gnd_clamp_ref"
close(thresholds(data, 1), (1.043, .757))  # IBIS default: 0 V.
data = copy.deepcopy(micron)
data["pullup reference"][1] = None
close(thresholds(data, 1), (1.100, .600))
data["model spec"]["vinh"][1] = None
close(thresholds(data, 1), (1.150, .600))  # Spec-defined NA => typ, not Model scalar.
data["model spec"]["vinh"][0] = None
try:
    thresholds(data, 1)
except ValueError:
    pass  # No Model scalar substitution for missing Model Spec typ: explicit mask required.
else:
    raise AssertionError("missing threshold must require an explicit mask")

late = [(0, .1), (1, .75), (1.02, .9), (1.5, 1.2), (2.08, .9), (3, .1)]
vectors = [
    ("valid", [(0, .1), (.5, .9), (1, 1.2), (1.5, .9), (3, .1)], .010, .045, (.490, .455), True),
    ("late", late, .010, .045, (-.030, 1.035), False),
    ("early", [(0, .1), (.2, .9), (.5, 1.2), (.98, .9), (1, .75), (3, .1)], .010, .045, (.790, -.065), False),
    ("wrong bit", [(0, .1), (3, .1)], .010, .045, (-3.010, -3.045), False),
    ("zero requirement", late, 0, 0, (-.020, 1.080), False),
]
for name, wave, setup, hold, expected, passes in vectors:
    pair, passed = margins(wave, setup=setup, hold=hold)
    close(pair, expected)
    assert passed == passes
    print(name, "setup/hold (ns):", pair, "pass:", passed)
close(margins([(0, 1.2), (3, 1.2)])[0], (.990, 1.955))  # Clipped ends.
assert margins([(0, .1), (3, .1)], bit=0)[1]  # Same voltage, transmitted low.
tie = [(0, .9), (.5, .9), (1, .1), (1.5, .9), (3, .9)]
close(margins(tie, setup=0, hold=0)[0], (1, -.5))  # Earliest interval wins.

primitive = [[4, -1, -1], [-1, 4, -1], [-1, -1, 4]]
reduced = reduce_reference(primitive)
close(reduced, [[10 / 3, -5 / 3], [-5 / 3, 10 / 3]])
assert reduced != [row[:-1] for row in primitive[:-1]]
v = [1.2, -.7]
u, d = list(map(sum, primitive)), sum(map(sum, primitive))
common = -sum(a * b for a, b in zip(u, v)) / d
full = [value + common for value in v] + [common]
charge = [sum(a * b for a, b in zip(row, full)) for row in primitive]
close(sum(charge), 0)
close(sum(a * b for a, b in zip(full, charge)),
      sum(v[i] * reduced[i][j] * v[j] for i in range(2) for j in range(2)))
close(reduce_reference(primitive, conductance=True), reduced)
close(reduce_reference([[0, 0], [0, 0]], conductance=True), [[0]])
close(reduce_reference([[1, -1], [-1, 1]], conductance=True), [[1]])
print("charge-neutral C (pF); same numeric G reduction (S):", reduced)
print("ALL CONTRACT CHECKS PASS (synthetic vectors and parsed vendor DC thresholds)")
