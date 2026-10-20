# Releasing

This package publishes through npm Trusted Publishing and GitHub Actions. npm Publishing access is configured to **Require two-factor authentication and disallow tokens**.

Do not add an `NPM_TOKEN` or `NODE_AUTH_TOKEN` secret. The publish workflow uses GitHub OIDC short-lived credentials and automatically generates npm provenance.

## Prerequisites

Before releasing, confirm:

- CI passes on `main`.
- `repository.url` still exactly matches `https://github.com/usercao/vite-oxc-bridge`.
- npm Trusted Publisher still authorizes `usercao/vite-oxc-bridge` and `.github/workflows/publish.yml` for `npm publish`.

Run the complete local check:

```sh
yarn check
```

## Publish a release

On GitHub, create and publish a release from `main`. In the **Choose a tag** field, enter a complete npm version without a `v` prefix, for example `0.8.0`, and let GitHub create the tag automatically.

For a prerelease, use a complete prerelease version such as `0.8.0-beta.1` and select **Set as a pre-release** in GitHub. Stable releases publish with the npm `latest` tag; GitHub prereleases publish with the npm `next` tag.

`1` alone is not a valid npm package version; use `1.0.0` instead. No local `npm version` or `git tag` command is needed.

Publishing the GitHub release triggers `.github/workflows/publish.yml`. The workflow:

- Exchanges GitHub's OIDC identity for a short-lived npm credential.
- Uses the release tag as the npm package version and rejects a `v` prefix or incomplete version.
- Installs dependencies from `yarn.lock`.
- Runs `yarn check` before publishing.
- Publishes stable releases to npm with the `latest` tag and prereleases with the `next` tag, including provenance.

GitHub Releases always require a tag, but creating the release in the GitHub UI creates that tag for you. The workflow does not create a Git tag or commit.

If publishing fails with `ENEEDAUTH`, verify the trusted publisher's repository and workflow filename before changing any npm access settings. Do not work around the failure by creating a long-lived automation token.
