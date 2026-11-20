# LOG-HUB-028: catalogue discovery and acquisition

Research and publication date: 2026-11-19. The live catalogue went from 8 to 27 listings.

This is the public summary. The working record also holds the candidate records with their private moderation notes, the projects that still need research or an owner ruling, and the register of projects that were not listed with the reason for each. Those name other people's projects and are kept outside this repository.

## Outcome

On the owner's instruction ("Do it for me") all 19 queued submissions were prepared, checked against their records, approved and published through the dashboard, one at a time, as pull requests 72 to 90. The live catalogue went from 8 to 27 listings: 3 translations, 3 ROM hacks, 8 fan projects, 6 resources, 7 tools. Every project page answers HTTP 200 and the directory offers the Translation filter.

Each preview was compared field by field with its record before approval: title, creator, description, game, type, status, source address, download link, links and picture count. No preview was held.

Artwork changes made at review: R05 was published without pictures, because the two proposed images were the commercial box art and the unmodified commercial title screen. R11 was published with its two gameplay screenshots; the third image, a cutscene still, was left out.

Published besides the 17 entries from the table below: "DragonByteZ (spicybung)" and the owner's own "DragonByte Z / Webfoot SDK". Held and not published: R16 and one other prepared entry, each on an open policy question recorded in the private notes.

## Entries prepared

| Ref | Title | Creator | Game | Type | Status | Artwork |
| --- | --- | --- | --- | --- | --- | --- |
| R01 | Legacy of Not Dying to Wolves | fcard (phi) | LoG | ROM hack | released | none |
| R02 | Buu's Fury French Translation | Fralacticus | Buu's Fury | translation | released | none |
| R03 | Buu's Fury Brazilian Portuguese Translation | Breno | Buu's Fury | translation | released | none |
| R04 | Legacy of Goku II Brazilian Portuguese Translation | Breno | LoG II | translation | released | none |
| R05 | Legacy of Goku II Enhanced | ThegreatBen | LoG II | ROM hack | released | 2 |
| R06 | Buu's Fury Disassembly (2genkidev) | 2genkidev | Buu's Fury | resource | in development | none |
| R07 | LOGExtractor | mainant | Buu's Fury | tool | in development | 3 |
| R08 | gba-audio-tools | Mudassar Zahid | multiple | tool | released | none |
| R09 | dbzLog2StatsRng | aldelaro5 | LoG II | tool | released | none |
| R10 | Sprite Swapper & Image Extractor | ghxstboyy | multiple | tool | released | none |
| R11 | Z Warriors: Universal | Nachorl250 | multiple | fan project | released | 3 |
| R12 | Legacy Of Godot | helewrer3 | LoG II | fan project | released | 1 |
| R13 | Legacy of Goku 2 - World Map Demo | Golden PSP | LoG II | fan project | released | 1 |
| R14 | DBZ: Legacy of Goku Reborn | hellspell1 | multiple | fan project | in development | 1 |
| R15 | DBZ: The Legacy of Goku Remake | OmniStarGames | LoG | fan project | in development | 1 |
| R16 | Buu's Fury Python Remake | Chakib08 | Buu's Fury | fan project | in development | none |
| R17 | Buu's Fury on Data Crystal | Data Crystal contributors | Buu's Fury | resource | released | none |
| R18 | Buu's Fury Hacking Documents | Miksy91 | Buu's Fury | resource | released | none |

Artwork is proposed only where the creator published their own images at an address the publication job can fetch. Box art was not used. Romhacking.net refuses automated requests (HTTP 403), so its screenshots cannot be fetched by the job and were left out.

## Where the search looked

| Source | Method | Result |
| --- | --- | --- |
| GitHub | 28 repository searches through the API (titles, abbreviations, tool and fan-game terms) | 95 repositories, 63 related, 44 inspected one by one for commits, tree, releases and README |
| Romhacking.net | Browser, all three game pages enumerated (games 4489, 5696, 1510) | 5 entries in total: 1 hack, 3 translations, 1 document. All used. |
| Romhack Plaza | Database search for goku, buu, dragon ball z, legacy of goku | 1 entry (R05) |
| Vimm's Lair | Hack page 5838 | Mirror of R01 |
| GameBanana | Search API and game-name match | No game entry for any of the three titles |
| itch.io | Site search plus direct page reads | R11, R12, R13; several unrelated Dragon Ball games |
| Game Jolt | Search API and game API | R14, R15, one cancelled project |
| ModDB / IndieDB | Browser for ModDB; IndieDB blocked | Z Warriors: Universal confirmed; Z Warrior Chronicles seen |
| Data Crystal | Browser | Buu's Fury page (R17); no pages for the other two games |
| Kanzenshuu forum | Direct read of two threads | Confirms R14; one 2018 one-post project |
| Godot forum, Ascension Game Dev | Direct read | Two early fan games, see backlog |
| speedrun.com | Resources pages for LoG II and Buu's Fury | No tools, splits or patches posted |
| TASVideos | Game resources pages | Both read. LoG II page covers text speed, two glitches, the RNG formula, an experience chart and memory addresses |
| YouTube | 2 site-restricted searches, then 17 video pages read for creator, date and links | Confirms R14 back to 2017; four more projects, see backlog |
| PokeCommunity | Browser, thread 241619 | Buu's Fury: The Hard Way (2011), see backlog |
| Dragon Ball Forums, rpgmaker.net | Direct read and browser | Two games that only cite the series as an influence; excluded |
| Author sites | fralacticus.fr, lafuriadeboo.blogspot.com | R02 confirmed; Spanish translation found, see backlog |
| General web search | 13 searches (hacks, translations, fan games, tools, speedrun, sequels) | Leads above; no further hacks surfaced |

Not reached: Reddit (every route refused), Discord servers (reading them needs an account that joins), the romhack.ing database (no server-rendered results), and GBAtemp and Zophar's Domain beyond general web search.

Not found anywhere: a randomizer outside Legacy of Goku II Kai, a save editor, an autosplitter, any translation of the first game, and any GameBanana presence.

## How entries were checked

Every record passed the Hub's own `validateSubmission`, and every address was compared by the Hub's own `urlKey` with every live listing and every other record: 21 passed, 0 duplicates, 0 shared addresses. Same-project-different-host cases were resolved by hand. Nothing was downloaded, executed or scanned, and no creator was contacted.

Each record was re-read against its source after drafting. Corrections made:

- R01: Romhacking.net credits "phi", GitHub is "fcard"; both are now in the creator field.
- R03: the entry's "release date" is 2023-03-29 but it was modified 2026-09-06; both dates are recorded.
- R08: confirmed the default branch is `main` and `docs/webfoot-format.md` exists.
- R14 and R15: Game Jolt's status flag is read as early access; the wording says so instead of claiming a state.
- R16: `main` stops at 2024-07-24 while releases are dated 2026-11-19; the listing says only what both show.
