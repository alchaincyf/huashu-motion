# Music — a different world for every film

The score is half of how a film feels, and it is the part people notice repeating. In October 2026 ten test
films in a row — two products, four versions of this skill — played the same band (synpluck, supersaw, violins,
piano, synbass, an 808 and a pop kit) at 120 BPM in a minor key: each time the composer opened the nearest
example score and kept its header. Every film sounded alike. `om sound` now prints each score's soundprint
(tempo, key, band) and warns when it is an example's band or the band of a recent film on this machine.

## Choose the world before the notes

1. **You choose, the user doesn't.** Music is not on the direction cards: most people can't pick a music
   world from a name. Once a direction is chosen, choose the world here and write it into the treatment
   (world · tempo · band · one reference). Offer options only when the user asks; a style or track they name wins.
2. **Variety comes from the product, not from a dice roll.** Read what is particular about this product — who
   uses it, where, at what pace, what it feels like to use, where it comes from — and let that pick the world,
   the tempo and the band. Two products are rarely the same in all of that, so their films rarely sound alike.
   The tempo is the product's and the cut's, not a default 120. Match the world to the product and the
   picture, not to "launch": a terminal tool can be pulse
   minimalism or minimal techno; a consumer app UK garage or folk; a model release cinematic or Reich; a
   notes app lo-fi; a game chiptune. The personality sliders (director §3) point the way: calm ↔ energetic,
   human ↔ technical, playful ↔ premium, local ↔ global.
3. **Then compose** with [sound.md](sound.md): sync points, a motif that becomes the sonic logo, roles in their
   own registers, the lift, the empty bar before the drop. The world gives the instruments, the groove and the
   harmony; the structure is the film's.
4. **Don't take a band from somewhere else.** Not from the example scores (they teach structure: a hook, a
   stop, a drop, a button), not from the last film. If `om sound` warns, change the world, not one instrument.

The worlds below each come with a two-bar sketch that renders as written (`om sound` on a film whose
`om-score` is the block). They are starting grooves, not finished music: write your own melody and harmony,
keep the groove's feel. Instruments and kits are listed in [sound.md](sound.md) § Composer mode.

## The worlds

### 1 · Pulse minimalism — Reich, Glass
No drums: interlocking marimba and piano eighths, a held string chord, harmony moving once every few bars.
Precise, intelligent, systems; AI that thinks, developer tools, infrastructure, data. 130–150 BPM felt in
eighths. *Steve Reich, Music for 18 Musicians · Philip Glass, Koyaanisqatsi.*

```abc
X:1
T:Pulse minimalism
M:3/4
L:1/8
Q:1/4=144
K:A
V:MA inst=marimba gain=0.8
A c e z c A | z e z c A z |
V:MB inst=marimba gain=0.7
c e z c A z | e z c A z A |
V:PN inst=piano gain=0.6
[A,E]6 | [F,C]6 |
V:ST inst=strings gain=0.5
[ce]6 | [cf]6 |
V:PZ inst=pizz gain=0.7
A,,2 A,,2 A,,2 | F,,2 F,,2 F,,2 |
```

### 2 · UK garage, 2-step — Jamie xx, Fred again..
A skipping kick, snares on two and four, ticking sixteenths, rootless minor-ninth Rhodes stabs, a round sub.
Cool, urban, social, consumer apps, anything made for the phone. 128–134 BPM. *Fred again.., Jamie xx.*

```abc
X:1
T:UK garage
M:4/4
L:1/8
Q:1/4=132
K:Cm
V:KK inst=drums kit=808 gain=0.9
C,,/ z/ z z z z C,,/ z/ z z | C,,/ z/ z z C,,/ z/ z z z z |
V:SN inst=drums kit=pop gain=0.8
^F,,/^F,,/ ^F,,/^F,,/ D,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ D,,/^F,,/ ^F,,/^F,,/ | ^F,,/^F,,/ ^F,,/^F,,/ D,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ D,,/^F,,/ ^F,,/^F,,/ |
V:RH inst=rhodes gain=0.7
z [EGBd] z2 [EGBd]/ z/ z z2 | z [A,CEG] z2 [A,CEG]/ z/ z z2 |
V:SB inst=sinebass gain=0.9
C,3 z C,/ z/ B,,3 | F,,3 z F,,/ z/ G,,3 |
V:CH inst=pluck gain=0.6
g/ z/ z c'/ z/ z2 g/ z/ z2 | f/ z/ z c'/ z/ z2 e/ z/ z2 |
```

### 3 · Minimal techno — Stripe, Vercel, a server rack at night
Four on the floor, open hats on the off-beats, a clap on two and four, a one-note sixteenth bass, a single
chord stab; builds by filtering, not by adding chords. Speed, infrastructure, precision. 122–128 BPM.

```abc
X:1
T:Minimal techno
M:4/4
L:1/8
Q:1/4=124
K:Am
V:KK inst=drums kit=808 gain=0.9
C,,2 C,,2 C,,2 C,,2 | C,,2 C,,2 C,,2 C,,2 |
V:HT inst=drums kit=808 gain=0.7
z ^A,, ^D,, ^A,, z ^A,, ^D,, ^A,, | z ^A,, ^D,, ^A,, z ^A,, ^D,, ^A,, |
V:BS inst=synbass gain=0.8
A,,/A,,/ z/A,,/ z/A,,/ A,,/z/ A,,/A,,/ z/A,,/ z/A,,/ A,,/z/ | A,,/A,,/ z/A,,/ z/A,,/ A,,/z/ C,/A,,/ z/A,,/ z/A,,/ G,,/z/ |
V:ST inst=sqlead gain=0.5
z2 [Ace]/ z/ z z2 [Ace]/ z/ z | z2 [Ace]/ z/ z z2 [GBd]/ z/ z |
```

### 4 · Drum and bass — speed made audible
A breakbeat at 170+, a long low saw (the "reese") under a held pad, bells far above. Performance, speed,
"fast" as the whole message, sport, gaming hype. 170–176 BPM (a half-time section at the same tempo is the stop).

```abc
X:1
T:Drum and bass
M:4/4
L:1/8
Q:1/4=174
K:Fm
V:BR inst=drums kit=acoustic gain=0.9
C,, z D,, z z C,, D,, z | C,, z D,, C,, z C,, D,, D,,/D,,/ |
V:HT inst=drums kit=acoustic gain=0.6
^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, | ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^A,, |
V:RS inst=saw gain=0.6
F,,8 | D,,6 E,,2 |
V:PD inst=warmpad gain=0.5
[FAc]8 | [DFA]8 |
V:BL inst=bell gain=0.4
c'2 z2 f'2 z2 | a2 z2 c'4 |
```

### 5 · Funk and disco — Daft Punk, Vulfpeck
A live kit with the kick on every beat, sixteenth bass in octaves, a clav or guitar on the off-beats, a brass
stab to end the phrase. Joy, play, creators, consumer apps with a sense of humour. 108–120 BPM.

```abc
X:1
T:Funk and disco
M:4/4
L:1/8
Q:1/4=114
K:Edor
V:KK inst=drums kit=acoustic gain=0.9
C,,2 [C,,D,,]2 C,,2 [C,,D,,]2 | C,,2 [C,,D,,]2 C,,2 [C,,D,,]2 |
V:HT inst=drums kit=acoustic gain=0.6
z ^A,, z ^A,, z ^A,, z ^A,, | z ^A,, z ^A,, z ^A,, ^F,,/^F,,/ ^A,, |
V:BS inst=bass gain=0.9
E,,/E,/ z/E,,/ E,/z/ G,,/A,,/ E,,/E,/ z/E,,/ D,/z/ B,,/D,/ | E,,/E,/ z/E,,/ E,/z/ G,,/A,,/ A,,/A,/ z/A,,/ G,/z/ D,/B,,/ |
V:CL inst=clav gain=0.6
z/ [GBe]/ z [GBe]/ z/ z z/ [GBe]/ z [GBe]/ z/ z | z/ [Ace]/ z [Ace]/ z/ z z/ [GBd]/ z [GBd]/ z/ z |
V:BR inst=brass gain=0.6
z8 | z6 [Bdg]/ z/ [Bdg] |
```

### 6 · Lo-fi hip-hop — the study stream
A dusty boom-bap kit (kit=lofi), lazy jazz seventh chords on the Rhodes, a round bass, a few vibraphone notes.
Calm productivity, notes, reading, journaling, cosy consumer apps. 76–90 BPM.

```abc
X:1
T:Lo-fi hip-hop
M:4/4
L:1/8
Q:1/4=84
K:F
V:DR inst=drums kit=lofi gain=0.9
C,,2 D,,2 z C,, D,,2 | C,,2 D,,2 C,,/ z/ C,, D,,2 |
V:HT inst=drums kit=lofi gain=0.5
^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, | ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^A,, ^F,, |
V:RH inst=rhodes gain=0.7
[FAce]4 [DFAc]4 | [GBdf]4 [CEGB]4 |
V:BS inst=bass gain=0.8
F,2 z F,/ A,/ D,2 z D, | G,2 z G,/ B,/ C,2 z C, |
V:VB inst=vibes gain=0.5
c'2 a f z4 | d'2 b g z2 e2 |
```

### 7 · Trap, half-time — the hype reel
An 808 kick and a long sub, a clap on beat three of every bar, hats rolling in sixteenths, a dark bell motif.
Bold, loud, game launches, "it's here". 136–150 BPM written, felt at half. Use it when the brief says hype,
not as the default for anything technical.

```abc
X:1
T:Trap
M:4/4
L:1/8
Q:1/4=140
K:Gm
V:KK inst=drums kit=808 gain=0.9
C,,3 C,, z4 | C,,2 z C,, z2 C,,2 |
V:CL inst=drums kit=808 gain=0.8
z4 D,,4 | z4 D,,4 |
V:HT inst=drums kit=808 gain=0.6
^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ | ^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ (3^F,,/^F,,/^F,,/ ^F,,/^F,,/ ^F,,/^F,,/ (3^F,,/^F,,/^F,,/ ^F,,/^F,,/ |
V:SB inst=sub808 gain=0.9
G,,4 z2 B,,2 | E,,4 z2 D,,2 |
V:BL inst=bell gain=0.5
d2 B G d2 z2 | c2 A F A2 z2 |
```

### 8 · Synthwave — the neon 80s
Gated snare on two and four, octave-jumping eighth bass, a saw arpeggio in sixteenths, a square lead holding
long notes. Nostalgia, retro brands, games, creative tools with a past. 96–112 BPM.

```abc
X:1
T:Synthwave
M:4/4
L:1/8
Q:1/4=104
K:Am
V:DR inst=drums kit=gated gain=0.9
C,,2 D,,2 C,,2 D,,2 | C,,2 D,,2 C,, C,, D,,2 |
V:HT inst=drums kit=gated gain=0.5
^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, | ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, |
V:BS inst=sinebass gain=0.8
A,,A, A,,A, A,,A, A,,A, | F,,F, F,,F, G,,G, G,,G, |
V:AR inst=saw gain=0.4
A/c/e/a/ A/c/e/a/ A/c/e/a/ A/c/e/a/ | F/A/c/f/ F/A/c/f/ G/B/d/g/ G/B/d/g/ |
V:LD inst=sqlead gain=0.5
e4 d2 c2 | c4 B4 |
```

### 9 · Cinematic orchestral — the trailer
Taiko on the downbeats (kit=cinematic), low strings in a driving sixteenth ostinato, horns holding the chord,
brass punctuating. Scale, ambition, a big model release, hardware, anything "historic". 80–100 BPM.

```abc
X:1
T:Cinematic
M:4/4
L:1/8
Q:1/4=90
K:Dm
V:TK inst=drums kit=cinematic gain=0.9
C,,2 z C,, C,,2 z C,, | C,,2 z C,, C,, C,, D,,2 |
V:LS inst=lowstr gain=0.8
D,/D,/F,/D,/ A,/D,/F,/D,/ D,/D,/F,/D,/ A,/D,/F,/D,/ | B,,/B,,/D,/B,,/ F,/B,,/D,/B,,/ C,/C,/E,/C,/ G,/C,/E,/C,/ |
V:HN inst=horn gain=0.7
[DFA]8 | [B,DF]4 [CEG]4 |
V:BR inst=brass gain=0.6
z6 [DA]2 | z4 [B,F] z [CG]2 |
```

### 10 · Lyrical piano and strings — Hisaishi
A singing piano line over a waltz, the Lydian raised fourth (here the B♮ in F) for wonder, strings holding,
harp rolling the chords, a flute doubling the tune at the peak. Human, warm, wonder, stories, consumer and
family products, a calm premium launch. 72–96 BPM, often in 3/4. *Joe Hisaishi, Summer · One Summer's Day.*

```abc
X:1
T:Lyrical waltz
M:3/4
L:1/8
Q:1/4=88
K:F
V:MEL inst=piano role=melody
A2 c2 f2 | e4 c2 | d2 =B2 G2 | A6 |
V:LH inst=piano gain=0.7
F,2 [Ac]2 [Ac]2 | C,2 [EG]2 [EG]2 | G,2 [=Bd]2 [=Bd]2 | F,2 [Ac]2 [Ac]2 |
V:STR inst=strings gain=0.5
[FA]6 | [EG]6 | [=B,D]6 | [CF]6 |
V:HP inst=harp gain=0.5
F,/A,/C/F/ A/c/ z z2 | C,/E,/G,/C/ E/G/ z z2 | G,/=B,/D/G/ =B/d/ z z2 | F,/A,/C/F/ A/c/ z z2 |
V:FL inst=flute gain=0.4
z6 | z6 | d'2 =b2 g2 | a6 |
```

### 11 · Jazz trio — La La Land
Swung piano comping on the off-beats, a walking bass, brushes (soft hats and rim), a vibraphone tune; ii–V–I
with sevenths and ninths. Craft, writing tools, warm premium, evening, anything with a human voice behind it.
120–180 BPM swung (write the swing as long–short pairs: `A3/ B/`).

```abc
X:1
T:Jazz trio
M:4/4
L:1/8
Q:1/4=150
K:C
V:BR inst=drums kit=acoustic gain=0.5
^F,,3/ ^F,,/ ^C,,2 ^F,,3/ ^F,,/ ^C,,2 | ^F,,3/ ^F,,/ ^C,,2 ^F,,3/ ^F,,/ ^C,, ^F,, |
V:WB inst=bass gain=0.9
D,2 F,2 A,2 C2 | G,,2 B,,2 D,2 F,2 |
V:PN inst=piano gain=0.6
z [FAce]2 z z [FAce] z2 | z [FA=Bd]2 z z [FABe] z2 |
V:VB inst=vibes role=melody gain=0.6
a3/ g/ f3/ e/ d2 c2 | =B3/ c/ d3/ f/ e4 |
```

### 12 · Acoustic folk — handclaps and a strummed guitar
Stomps and claps (kit=folk), a strummed acoustic guitar, ukulele on the off-beats, a glockenspiel tune; major,
I–IV–vi–V. Friendly, small team, everyday consumer, cute brands, family. 92–112 BPM. *Feist, 1234.*

```abc
X:1
T:Acoustic folk
M:4/4
L:1/8
Q:1/4=104
K:G
V:BD inst=drums kit=folk gain=0.9
C,,2 ^D,,2 C,,2 ^D,,2 | C,,2 ^D,,2 C,, C,, ^D,,2 |
V:SH inst=drums kit=folk gain=0.5
^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, | ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, |
V:GT inst=guitar gain=0.7
[G,DGB]2 [G,DGB] [G,DGB] z [G,DGB] [G,DGB]2 | [CEGc]2 [CEGc] [CEGc] z [DFAd] [DFAd]2 |
V:UK inst=uke gain=0.5
z [GBd] z [GBd] z [GBd] z [GBd] | z [Gce] z [Gce] z [Adf] z [Adf] |
V:GL inst=glock gain=0.5
d'2 b2 g2 b2 | c'2 e'2 d'4 |
```

### 13 · Chiptune — the 8-bit console
The 8-bit kit (kit=chip), a triangle bass in octaves, a square-wave lead with fast arpeggios. Games, pixel
brands, playful developer tools, nostalgia. 140–170 BPM.

```abc
X:1
T:Chiptune
M:4/4
L:1/8
Q:1/4=150
K:C
V:DR inst=drums kit=chip gain=0.8
C,, ^F,, D,, ^F,, C,, C,, D,, ^F,, | C,, ^F,, D,, ^F,, C,, C,, D,, D,, |
V:TB inst=tri gain=0.8
C,C C,C A,,A, A,,A, | F,,F, F,,F, G,,G, G,,G, |
V:LD inst=chip role=melody gain=0.5
c/e/g/c'/ e'2 d'/c'/a/g/ a2 | f/a/c'/f'/ e'2 d'/b/g/d/ g2 |
```

### 14 · Ambient glass — the quiet ident
No beat: a warm pad, glass and bell tones placed far apart, a kalimba figure, a sine bass under it all.
Calm, privacy, wellness, a meditative loop, a quiet ident, the end card of a loud film. 60–80 BPM.

```abc
X:1
T:Ambient glass
M:4/4
L:1/8
Q:1/4=68
K:E
V:PD inst=warmpad gain=0.6
[EGBd]8 | [CEGB]8 |
V:GL inst=glass gain=0.5
b2 z2 e'2 z2 | g2 z2 b4 |
V:KL inst=kalimba gain=0.5
z e g b z2 e2 | z c e g z2 B2 |
V:SB inst=sinebass gain=0.6
E,,8 | C,,8 |
```

### 15 · 国风 electronic — guzheng over a beat
A guzheng running pentatonic figures, a dizi melody, an erhu holding long notes, over a tight kick, claps and
808 hats (an 808 kick's long boom buries the plucked strings at this tempo).
Chinese brands and culture, tea, heritage, a modern take on tradition. 88–104 BPM.

```abc
X:1
T:Guofeng electronic
M:4/4
L:1/8
Q:1/4=96
K:D
V:KK inst=drums kit=pop gain=0.7
C,,2 z C,, ^D,,2 z C,, | C,,2 z C,, ^D,,2 C,, ^D,, |
V:HT inst=drums kit=808 gain=0.5
^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, | ^F,, ^F,, ^F,, ^F,, ^F,, ^F,, ^F,,/^F,,/ ^F,, |
V:GZ inst=guzheng gain=0.9
D/E/F/A/ B/A/F/E/ D/E/F/A/ B/d/B/A/ | B,/D/E/F/ A/F/E/D/ E/F/A/B/ d/B/A/F/ |
V:DZ inst=dizi role=melody gain=0.8
A2 B d e2 d B | A4 F2 E2 |
V:EH inst=erhu gain=0.5
F8 | E4 D4 |
V:SB inst=sub808 gain=0.4
D,,4 z2 D,,2 | B,,4 A,,4 |
```

### 16 · Amapiano — the log drum
A soft four-on-the-floor, shakers in sixteenths, a rimshot pattern, short syncopated sub notes (the "log
drum"), jazzy piano chords. Fashion, music, social, joyful consumer launches. 110–116 BPM.

```abc
X:1
T:Amapiano
M:4/4
L:1/8
Q:1/4=113
K:Am
V:KK inst=drums kit=acoustic gain=0.7
C,,2 C,,2 C,,2 C,,2 | C,,2 C,,2 C,,2 C,,2 |
V:SH inst=drums kit=pop gain=0.5
^A/^A/ ^A/^A/ ^A/^C,,/ ^A/^A/ ^A/^A/ ^C,,/^A/ ^A/^A/ ^A/^C,,/ | ^A/^A/ ^A/^A/ ^A/^C,,/ ^A/^A/ ^A/^A/ ^C,,/^A/ ^A/^A/ ^A/^C,,/ |
V:LG inst=sub808 gain=0.8
z A,,/ z/ z A,,/ C,/ z E,/ z/ A,,/ z/ z | z F,,/ z/ z F,,/ A,,/ z G,,/ z/ G,,/ z/ z |
V:PN inst=piano gain=0.6
[ACEG]3 [ACEG] z2 [ACEG]2 | [FAce]3 [FAce] z2 [GBdf]2 |
```

## Which world, for what

| Personality / product | Worlds that fit | Worlds to avoid |
|---|---|---|
| precise, technical, developer, infra | pulse minimalism · minimal techno · drum and bass · chiptune (playful) | lyrical waltz, folk |
| AI that thinks, research, a model | pulse minimalism · cinematic · ambient glass · minimal techno | funk, trap |
| consumer, social, phone-first | UK garage · amapiano · funk · folk | cinematic, ambient |
| warm, human, story, family | lyrical waltz · folk · jazz trio · lo-fi | techno, trap |
| calm, wellness, notes, privacy | ambient glass · lo-fi · lyrical waltz | drum and bass, trap |
| hype, game, sport, bold | trap · drum and bass · synthwave · chiptune | ambient, jazz |
| premium, craft, design tools | jazz trio · pulse minimalism · lyrical piano · UK garage | chiptune |
| retro, nostalgic | synthwave · chiptune · funk | — |
| Chinese culture, heritage | 国风 electronic · lyrical waltz with dizi/guzheng | — |

Most products sit in two rows at once (a developer tool for calm, private work; an AI product for families):
the world that fits both is usually the right one, and it is rarely the obvious first pick of either row. Never
the world of the last film unless the user asked for it.
