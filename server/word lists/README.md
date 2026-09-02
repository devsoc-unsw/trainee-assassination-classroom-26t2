# Raw candidate pool. This is not the live word list!!!

The game reads [`server/words.ts`](../words.ts). Nothing in this directory is
loaded at runtime. These files are kept as raw material to draw more words from
when a category needs filling out. I'll still keep it here though so if in the future we want to incorporate fun categories like idioms, we can modify accordingly and use these as inspiration :)

Anything promoted from here into `words.ts` has to pass the six rules documented
at the top of that file, which most of these entries currently do not.

## animals / food / places / extra / idioms

Usable as source material. `extra.txt` is the largest pool (623 words) but has
no category attached, so each word needs one assigning by hand. Watch for:

- real plurals (`skewers`, `glasses`, `maracas`, `blues`)
- synonym pairs where a drawing reads equally well as either word
- words that already appear in `words.ts` under a different category

## anime / books / films / songs

**Not promotable as they stand.** T19 matches the imposter's guess against the
word exactly, and these ~373 entries are proper nouns full of characters a
player cannot reliably type:

| Problem                      | Examples                                       |
| ---------------------------- | ---------------------------------------------- |
| Curly apostrophes            | `Bridget Jones’s Diary`, `Stayin’ Alive`       |
| Non-ASCII                    | `Für Elise`, `…Baby One More Time`             |
| Digits vs words              | `50 Shades of Grey`, `12 Years a Slave`        |
| Colons and stray punctuation | `Avengers: Endgame`, `Shazam!`, `Mother!`      |
| Ampersands                   | `Red, White & Royal Blue`                      |
| Optional articles            | `Lord of the Rings` vs `The Lord of the Rings` |

Every one of these is a guess a player gets right and the game rejects. If the
team wants a media category later it needs its own matching rules, not this
list plugged into the existing matcher.

There are also cross-file duplicates to resolve before any promotion:
`chicken`, `fish`, `kiwi` (animal and food), `the notebook`,
`call me by your name` (book and film).
