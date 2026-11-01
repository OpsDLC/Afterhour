Basic-Latin subsets (U+0020–007E, no hinting, no layout features) used by the rain-font tests.

- `EBGaramond-Regular-latin.ttf` — EB Garamond, © The EB Garamond Project Authors
- `Arimo-Regular-latin.ttf` — Arimo, © The Arimo Project Authors

Both are licensed under the SIL Open Font License 1.1 (https://openfontlicense.org); the licence
text is kept in each file's `name` table (IDs 0, 13, 14). Made with:

    pyftsubset <font>.ttf --unicodes=U+0020-007E --layout-features='' --no-hinting \
      --name-IDs='*' --name-languages='*'
