# Logo Sources

All logo CSVs are registered in `public/logos/index.json`. Add new logo files there to make them available across the app.

Format:

```json
{
  "sources": [
    { "type": "team", "path": "logos/fbs_logos.csv" },
    { "type": "conference", "path": "logos/conference_logos.csv" }
  ]
}
```

Notes:
- `path` can be a public relative path (recommended) or a full URL.
- `type` must be `team` or `conference`.
