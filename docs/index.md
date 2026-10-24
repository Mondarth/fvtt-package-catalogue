# Foundry VTT Package Catalogue

The catalogue gathers what [Foundry VTT](https://foundryvtt.com), its game systems and its modules declare in their
manifests, from Foundry VTT's package listing, GitHub and GitLab, and serves it through an API shaped for
[`@mondarth/fvtt-resolver`](https://github.com/ulenarofmondarth/pdt/tree/main/packages/fvtt-resolver) and
[EMMA](https://github.com/Mondarth/EMMA).

It is a faster source beside the CORS proxy those tools use: one request to the catalogue answers what would take them
many requests to the package listing, the forges and each manifest. Where the catalogue has no answer, they fall back to
the proxy.

:::{note}
The website is in English and Spanish. **The Spanish translation is a machine translation (AI), not reviewed by a
Spanish speaker**; the website says so on every page in Spanish. See {doc}`developer/i18n`.
:::

:::{note}
**Early development.** The API serves what is in its database, which the worker fills as packages are asked for.
Before 1.0.0, anything may change.
:::

```{toctree}
:maxdepth: 2
:caption: Using it

user/api
user/deployment
```

```{toctree}
:maxdepth: 2
:caption: Developing it

developer/index
```

```{todolist}
```
