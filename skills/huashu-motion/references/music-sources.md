# Where a real track comes from

Order of preference (SKILL.md step 6): ① the user's own track → ② a music tool already in the environment (the user generates with their own account; the file stays in the project) → ③ `om music`, the default library → ④ an openly licensed library (below) → ⑤ the synthesized score, as the fallback, said so at delivery.

Whatever the source: the file goes into the project (`om sound --music <file>` or `om music use <id> <dir>` copies it to `assets/music/`), so the film reproduces without the network. Licence findings below were read from the sources' own pages on 2026-11-20; anything not read there is marked **unverified**. Licences change: check the track's own page before shipping a film that will be sold or run as an ad.

## ① ② The user's own, or one they generate

The user's file is theirs; huashu-motion claims nothing on it. For an AI tool in the environment (a music skill, a generation API the user already has), ask the user to generate with their own account and plan, name the tool and brief in `treatment.md`, and keep the file in `assets/music/`. Generation plans differ in what they allow for commercial use: that is the user's account and terms, not something to assume. Pure instrumental, 30–60 s longer than the film, is the brief that works (`om sound` trims, loops on bar lines and fades).

## ③ The default library (`om music`)

Instrumental tracks made by the repository author with AI tools, released for any use with no credit ([music/LICENSE.md](../../../music/LICENSE.md)). To the extent the law allows, the author waives his rights; there is no warranty, including that a track will not be matched by a platform's content-identification system. Do not register them anywhere. No attribution line is needed. `om music` lists them; `om music build` downloads them (sha256-checked).

## ④ Openly licensed libraries: take CC0 and CC BY only

Take only tracks that are CC0 or CC BY (any version). Reject CC BY-NC (no commercial use), CC BY-ND (a trim, loop or fade is a derivative), CC BY-SA unless the user accepts that the film's soundtrack carries share-alike. Write the credit when the track goes in: `om music add <file> --license "CC BY 4.0" --credit "Title — Artist (source URL)"`, then `om music use`, which writes `assets/music/CREDITS.md`; put the same lines in the film's description or the post.

| Source | Finding | Status |
|---|---|---|
| Kevin MacLeod, incompetech.com | Licensed CC BY 4.0. The page gives the credit template below. | verified |
| Free Music Archive, ccMixter, Wikimedia Commons, Internet Archive | Each track carries its own licence; filter to CC0 / CC BY and read the track page. | per-track; the sites' current terms **unverified** |
| Freesound | Per-sound licence (CC0, CC BY, CC BY-NC); music loops are mostly short. | **unverified** |
| Public-domain recordings (Musopen and similar) | The composition may be free while a given recording is not: the recording's own licence decides. | **unverified** |

CC BY credit template (Kevin MacLeod's own; the same shape works for any CC BY track):

```
Title — Artist (source URL)
Licensed under Creative Commons: By Attribution 4.0
https://creativecommons.org/licenses/by/4.0/
```
Say if you cut, looped or faded it ("trimmed and faded").

## Do not scrape these

- **Pixabay.** The content licence allows commercial use without credit, but the terms prohibit "data mining, extraction, scraping and the use of programs or robots for automatic data collection" and "bulk, large-scale or systematic copying". A person may download a track by hand and put it in the project; an agent must not crawl or batch-download the site. verified (pixabay.com/service/terms, /license-summary).
- **Uppbeat.** The free plan requires the credit Uppbeat gives you on download, per use, and (per third-party summaries) is limited to a few downloads a month and to individual creators; business and client work needs a paid plan. Its terms on automated access were not read: treat automated download as not allowed. Partly **unverified**.
- **Bensound.** The free tier is a proprietary "free licence with attribution" (not Creative Commons), for free-to-view online video; third-party summaries say it excludes ads and paid promotion and remixing. The terms page itself could not be read. **unverified**: do not use for client or ad films, and do not crawl.

## The Jamendo API is non-commercial only

Jamendo's developer terms make the API free for non-commercial use; anything else needs a deal with Jamendo Licensing (devportal.jamendo.com/api_terms_of_use, via search summary; the page itself was not fetched: **unverified** in detail). Individual tracks carry their own CC licences and some forbid commercial use. A film for a product or a business is commercial: do not take tracks through the API for it. A person may still hear a track on jamendo.com and license it there.

## Record it

When a track comes from a source in this file, add it to `materials.md` with source, licence and where the credit went, as for any other asset.
