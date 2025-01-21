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
- An official github workflow action for pushing to the tscircuit registry
- A modern Registry Server
  - Package bundling
  - Building Circuit JSON on-server
  - Package Releases (Versioning)
  - Generate preview images for usage in Github READMEs

## tscircuit Registry Packages

### Pushing to the tscircuit Registry
