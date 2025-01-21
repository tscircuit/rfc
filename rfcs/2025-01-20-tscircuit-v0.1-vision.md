# tscircuit v0.1 Vision

This RFC lays out the vision for the tscircuit v0.1 release. The main idea behind the
v0.1 release is to make tscircuit viable for commercial electronics development by
enabling modern development practices.

The most important features for the tscircuit v0.1 releases are as follows:

- A command line tool, `tsci` with the following key functions
  - Login/Logout
  - Start a local development server
  - Push packages to the tscircuit registry
  - Package installation with typechecking
  - Package and Github workflow initialization
  - Exporting to different file formats
  - Snapshot testing
- An official github workflow action for pushing to the tscircuit registry whenever
  code is pushed to Github
- A modern Registry Server
  - Public and Private Packages
  - Package bundling
  - Building Circuit JSON on-server
  - Package Releases (Versioning)
  - Generate preview images for usage in Github READMEs
  - Organization Accounts
 
## Motivation

tscircuit is a new EDA tool with many capabilities. However, in v0.0.x it mainly has
only been usable on the web. v0.1 adapts tscircuit to be more compatible with modern
development practices. In particular, modern developers prefer:

- Coding in their preferred IDE locally
- Using Github for version control
- Workflow automations to simplify exporting, visualizing and sharing electronics

## tscircuit Registry Packages

The tscircuit registry an advanced version of the NPM registry with additional
features to make packages more interoperable, Typescript-native and
electronics-friendly.

> See [jsr.io](https://jsr.io/) for an example of a Typescript-first registry

### Pushing to the tscircuit Registry

When you push to the tscircuit Registry, several internal workflows are run:

1. Bundle Typescript source into ESM Javascript
2. Bundle Typescript source into CJS Javascript
3. Bundle Typescript source into `dts` Typescript
4. Compress ESM, CJS and `dts` into an NPM tarball
5. Generate Circuit JSON from source code

If any of these workflows fail, the `tsci push` command will error. If you do
`tsci push -f`, the code will be pushed regardless.

Running `tsci push` is the same as saving a snippet on `tscircuit.com`

### Releasing New Versions

`tsci release` is the same as `tsci push`, except it increments the version of the
package.

- When a new package version is released, the package release associated with the
  version is "locked". It can no longer be changed.
- If you push to a package and the last version is locked, the package automatically
  gets a new "patch" version which becomes the `latest` version of the package.
- You can increment the minor version with `tsci release --minor` or `tsci release --major`



