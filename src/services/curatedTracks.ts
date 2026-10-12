import { Song, LyricsData } from '../types/lyrics';

export const CURATED_TRACKS: Song[] = [
  {
    id: 'espresso-sabrina-carpenter',
    title: 'Espresso',
    artist: 'Sabrina Carpenter',
    album: 'Short n\' Sweet',
    albumArt: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
    durationMs: 175000, // 2:55
    amazonMusicUrl: 'https://music.amazon.com/albums/B0D5N4Q46Y?trackAsin=B0D5N6B6FZ',
    year: '2024',
    genre: 'Pop / Nu-Disco',
    isExplicit: false,
  },
  {
    id: 'birds-of-a-feather-billie-eilish',
    title: 'BIRDS OF A FEATHER',
    artist: 'Billie Eilish',
    album: 'HIT ME HARD AND SOFT',
    albumArt: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop',
    durationMs: 196000, // 3:16
    amazonMusicUrl: 'https://music.amazon.com/albums/B0CY2PL22L',
    year: '2024',
    genre: 'Alternative Pop',
    isExplicit: false,
  },
  {
    id: 'cruel-summer-taylor-swift',
    title: 'Cruel Summer',
    artist: 'Taylor Swift',
    album: 'Lover',
    albumArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
    durationMs: 178000, // 2:58
    amazonMusicUrl: 'https://music.amazon.com/albums/B07VGX87F5',
    year: '2019',
    genre: 'Synth-Pop',
    isExplicit: false,
  },
  {
    id: 'blinding-lights-the-weeknd',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    albumArt: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop',
    durationMs: 200000, // 3:20
    amazonMusicUrl: 'https://music.amazon.com/albums/B0855NMDM3',
    year: '2020',
    genre: 'Synthwave / Pop',
    isExplicit: false,
  },
  {
    id: 'not-like-us-kendrick-lamar',
    title: 'Not Like Us',
    artist: 'Kendrick Lamar',
    album: 'Not Like Us - Single',
    albumArt: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&h=300&fit=crop',
    durationMs: 274000, // 4:34
    amazonMusicUrl: 'https://music.amazon.com/albums/B0D3BVN4HQ',
    year: '2024',
    genre: 'West Coast Hip-Hop',
    isExplicit: true,
  },
];

export const CURATED_LYRICS_DATA: Record<string, LyricsData> = {
  'espresso-sabrina-carpenter': {
    songId: 'espresso-sabrina-carpenter',
    title: 'Espresso',
    artist: 'Sabrina Carpenter',
    album: 'Short n\' Sweet',
    albumArt: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop',
    provider: 'Genius',
    plainLyrics: `Now he's thinkin' 'bout me every night, oh
Is it that sweet? I guess so
Say you can't sleep, baby, I know
That's that me espresso
Move it up, down, left, right, oh
Switch it up like Nintendo
Say you can't sleep, baby, I know
That's that me espresso

I can't relate to desperation
My give-a-fucks are on vacation
And I got this one boy and he won't stop callin'
When they act like this, I can't be stallin'
Walked in and dream-came-trued it for ya
Soft skin and I perfumed it for ya
Yes, I know I'm an acquired taste
No, you won't ever see my waste

Now he's thinkin' 'bout me every night, oh
Is it that sweet? I guess so
Say you can't sleep, baby, I know
That's that me espresso
Move it up, down, left, right, oh
Switch it up like Nintendo
Say you can't sleep, baby, I know
That's that me espresso`,
    syncedLyrics: [
      { id: 'esp-0', startTimeMs: 2000, text: '♪ (Upbeat nu-disco groove plays) ♪', section: 'intro' },
      { id: 'esp-1', startTimeMs: 7800, text: "Now he's thinkin' 'bout me every night, oh", section: 'chorus', annotationId: 'ann-esp-1' },
      { id: 'esp-2', startTimeMs: 11500, text: 'Is it that sweet? I guess so', section: 'chorus' },
      { id: 'esp-3', startTimeMs: 15400, text: "Say you can't sleep, baby, I know", section: 'chorus' },
      { id: 'esp-4', startTimeMs: 19200, text: "That's that me espresso", section: 'chorus', annotationId: 'ann-esp-2' },
      { id: 'esp-5', startTimeMs: 23100, text: 'Move it up, down, left, right, oh', section: 'chorus' },
      { id: 'esp-6', startTimeMs: 26800, text: 'Switch it up like Nintendo', section: 'chorus', annotationId: 'ann-esp-3' },
      { id: 'esp-7', startTimeMs: 30600, text: "Say you can't sleep, baby, I know", section: 'chorus' },
      { id: 'esp-8', startTimeMs: 34400, text: "That's that me espresso", section: 'chorus' },
      { id: 'esp-9', startTimeMs: 38200, text: "I can't relate to desperation", section: 'verse' },
      { id: 'esp-10', startTimeMs: 42000, text: 'My give-a-fucks are on vacation', section: 'verse' },
      { id: 'esp-11', startTimeMs: 45800, text: "And I got this one boy and he won't stop callin'", section: 'verse' },
      { id: 'esp-12', startTimeMs: 49500, text: "When they act like this, I can't be stallin'", section: 'verse' },
      { id: 'esp-13', startTimeMs: 53300, text: "Walked in and dream-came-trued it for ya", section: 'verse', annotationId: 'ann-esp-4' },
      { id: 'esp-14', startTimeMs: 57200, text: 'Soft skin and I perfumed it for ya', section: 'verse' },
      { id: 'esp-15', startTimeMs: 61000, text: "Yes, I know I'm an acquired taste", section: 'verse' },
      { id: 'esp-16', startTimeMs: 64800, text: "No, you won't ever see my waste", section: 'verse' },
      { id: 'esp-17', startTimeMs: 68600, text: "♪ (Bass drop & funky guitar breakdown) ♪", section: 'instrumental' },
      { id: 'esp-18', startTimeMs: 76200, text: "Now he's thinkin' 'bout me every night, oh", section: 'chorus' },
      { id: 'esp-19', startTimeMs: 80000, text: 'Is it that sweet? I guess so', section: 'chorus' },
      { id: 'esp-20', startTimeMs: 83800, text: "Say you can't sleep, baby, I know", section: 'chorus' },
      { id: 'esp-21', startTimeMs: 87600, text: "That's that me espresso", section: 'chorus' },
      { id: 'esp-22', startTimeMs: 91400, text: 'Move it up, down, left, right, oh', section: 'chorus' },
      { id: 'esp-23', startTimeMs: 95200, text: 'Switch it up like Nintendo', section: 'chorus' },
      { id: 'esp-24', startTimeMs: 99000, text: "Say you can't sleep, baby, I know", section: 'chorus' },
      { id: 'esp-25', startTimeMs: 102800, text: "That's that me espresso", section: 'chorus' },
      { id: 'esp-26', startTimeMs: 107000, text: 'Holy shit, I got a lot of caffeine in me!', section: 'bridge' },
      { id: 'esp-27', startTimeMs: 111500, text: 'I mean, I look too good to be overlooked', section: 'bridge' },
      { id: 'esp-28', startTimeMs: 116000, text: "That's that me espresso, baby", section: 'outro' },
    ],
    annotations: [
      {
        id: 'ann-esp-1',
        lineRef: "Now he's thinkin' 'bout me every night, oh",
        header: 'Nighttime Insomnia Metaphor',
        content: 'Sabrina compares her intoxicating persona to an espresso shot: keeping her romantic partner up at night with racing thoughts and adrenaline.',
        verifiedBy: 'Sabrina Carpenter (Genius Verified Artist)',
        votes: 1420,
        sourceUrl: 'https://genius.com/Sabrina-carpenter-espresso-lyrics',
      },
      {
        id: 'ann-esp-2',
        lineRef: "That's that me espresso",
        header: 'Viral Grammatical Hook',
        content: '"Me espresso" functions as a playful modifier. Sabrina explained on Genius that she wanted a phrase that sticks in your head like an earworm coffee order.',
        verifiedBy: 'Genius Editorial Team',
        votes: 3890,
      },
      {
        id: 'ann-esp-3',
        lineRef: 'Switch it up like Nintendo',
        header: 'Retro Gaming Wordplay',
        content: 'Refers both to Nintendo\'s versatile handheld/home console "Switch" and nostalgic D-pad controls ("Move it up, down, left, right").',
        verifiedBy: 'PopCulture Decoders',
        votes: 2150,
      },
      {
        id: 'ann-esp-4',
        lineRef: "Walked in and dream-came-trued it for ya",
        header: 'Verbing the Idiom',
        content: 'Carpenter turns the common expression "dream come true" into an active transitive verb, highlighting her effortless charm.',
        verifiedBy: 'Lyrical Genius Scholar',
        votes: 980,
      },
    ],
    trivia: [
      'Debuted at #1 on the Global Spotify and Amazon Music charts within 48 hours of Coachella performance.',
      'Produced by Julian Bunetta and written in an open-air French cafe in Chaumont-sur-Loire.',
      'Featured in Amazon Music\'s Song of the Summer billboard campaign in New York Times Square.',
    ],
    trackInfo: {
      writers: ['Sabrina Carpenter', 'Amy Allen', 'Julian Bunetta', 'Steph Jones'],
      producers: ['Julian Bunetta'],
      releaseDate: 'April 11, 2024',
    },
  },
  'birds-of-a-feather-billie-eilish': {
    songId: 'birds-of-a-feather-billie-eilish',
    title: 'BIRDS OF A FEATHER',
    artist: 'Billie Eilish',
    album: 'HIT ME HARD AND SOFT',
    albumArt: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop',
    provider: 'Genius',
    plainLyrics: `I want you to stay 'til I'm in the grave
'Til I rot away, dead and buried
'Til I'm in the casket you carry
If you go, I'm goin' too, uh
'Cause it was always you, alright
And if I'm turnin' blue, please don't save me
Nothing left to lose without my baby

Birds of a feather, we should stick together, I know
I said I'd never think I wasn't better alone
Can't change the weather, might not be forever
But if it's forever, it's even better`,
    syncedLyrics: [
      { id: 'bof-1', startTimeMs: 4000, text: "I want you to stay 'til I'm in the grave", section: 'verse', annotationId: 'ann-bof-1' },
      { id: 'bof-2', startTimeMs: 9500, text: "'Til I rot away, dead and buried", section: 'verse' },
      { id: 'bof-3', startTimeMs: 14200, text: "'Til I'm in the casket you carry", section: 'verse' },
      { id: 'bof-4', startTimeMs: 18800, text: "If you go, I'm goin' too, uh", section: 'verse' },
      { id: 'bof-5', startTimeMs: 23200, text: "'Cause it was always you, alright", section: 'verse' },
      { id: 'bof-6', startTimeMs: 27800, text: "And if I'm turnin' blue, please don't save me", section: 'verse', annotationId: 'ann-bof-2' },
      { id: 'bof-7', startTimeMs: 32500, text: 'Nothing left to lose without my baby', section: 'verse' },
      { id: 'bof-8', startTimeMs: 37200, text: 'Birds of a feather, we should stick together, I know', section: 'chorus', annotationId: 'ann-bof-3' },
      { id: 'bof-9', startTimeMs: 44000, text: "I said I'd never think I wasn't better alone", section: 'chorus' },
      { id: 'bof-10', startTimeMs: 49500, text: "Can't change the weather, might not be forever", section: 'chorus' },
      { id: 'bof-11', startTimeMs: 54800, text: "But if it's forever, it's even better", section: 'chorus' },
      { id: 'bof-12', startTimeMs: 61000, text: 'And I don\'t know what I\'m cryin\' for', section: 'verse' },
      { id: 'bof-13', startTimeMs: 66000, text: 'I don\'t think I could love you more', section: 'verse' },
      { id: 'bof-14', startTimeMs: 70500, text: 'It might not be long, but baby, I', section: 'verse' },
      { id: 'bof-15', startTimeMs: 75200, text: 'I\'ll love you \'til the day that I die', section: 'chorus' },
      { id: 'bof-16', startTimeMs: 81000, text: '\'Til the day that I die', section: 'chorus' },
      { id: 'bof-17', startTimeMs: 85500, text: '\'Til the light leaves my eyes', section: 'outro' },
    ],
    annotations: [
      {
        id: 'ann-bof-1',
        lineRef: "I want you to stay 'til I'm in the grave",
        header: 'Gothic Devotion',
        content: 'Billie pairs an upbeat, sunny 80s indie-pop guitar groove with macabre expressions of unconditional eternal devotion.',
        verifiedBy: 'FINNEAS & Billie Eilish (Genius Interview)',
        votes: 3100,
      },
      {
        id: 'ann-bof-2',
        lineRef: "And if I'm turnin' blue, please don't save me",
        header: 'Color Motifs & Hypoxia',
        content: 'Throughout the "HIT ME HARD AND SOFT" era, blue symbolizes deep emotional submergence, mirroring the underwater album cover.',
        verifiedBy: 'Genius Staff',
        votes: 1820,
      },
      {
        id: 'ann-bof-3',
        lineRef: 'Birds of a feather, we should stick together, I know',
        header: 'The Classic Idiom Inverted',
        content: 'From the proverb "birds of a feather flock together". Eilish explores how two sensitive, wounded souls create their own sanctuary.',
        verifiedBy: 'Genius Certified Musicologist',
        votes: 2490,
      },
    ],
    trivia: [
      'Written and produced in FINNEAS\'s home studio in Los Angeles with live acoustic drums and Juno-106 analog synth layers.',
      'Featured prominently in Netflix\'s Heartstopper Season 3 premiere trailer.',
      'Became Billie\'s longest-running #1 track across global streaming platforms in 2024.',
    ],
    trackInfo: {
      writers: ['Billie Eilish O\'Connell', 'Finneas O\'Connell'],
      producers: ['Finneas'],
      releaseDate: 'May 17, 2024',
    },
  },
  'cruel-summer-taylor-swift': {
    songId: 'cruel-summer-taylor-swift',
    title: 'Cruel Summer',
    artist: 'Taylor Swift',
    album: 'Lover',
    albumArt: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=300&h=300&fit=crop',
    provider: 'Genius',
    plainLyrics: `Fever dream high in the quiet of the night
You know that I caught it
Bad, bad boy, shiny toy with a price
You know that I bought it

Killing me slow, out the window
I'm always waiting for you to be waiting below
Devils roll the dice, angels roll their eyes
What doesn't kill me makes me want you more

And it's new, the shape of your body
It's blue, the feeling I've got
And it's ooh, whoa, oh
It's a cruel summer
It's cool, that's what I tell 'em
No rules in breakable heaven
But ooh, whoa, oh
It's a cruel summer with you

I'm drunk in the back of the car
And I cried like a baby coming home from the bar
Said, "I'm fine," but it wasn't true
I don't wanna keep secrets just to keep you
And I snuck in through the garden gate
Every night that summer just to seal my fate
And I screamed for whatever it's worth
"I love you," ain't that the worst thing you ever heard?
He looks up grinning like a devil`,
    syncedLyrics: [
      { id: 'cs-1', startTimeMs: 3500, text: 'Fever dream high in the quiet of the night', section: 'verse' },
      { id: 'cs-2', startTimeMs: 6500, text: 'You know that I caught it', section: 'verse' },
      { id: 'cs-3', startTimeMs: 9500, text: 'Bad, bad boy, shiny toy with a price', section: 'verse' },
      { id: 'cs-4', startTimeMs: 12500, text: 'You know that I bought it', section: 'verse' },
      { id: 'cs-5', startTimeMs: 15500, text: 'Killing me slow, out the window', section: 'verse' },
      { id: 'cs-6', startTimeMs: 18500, text: "I'm always waiting for you to be waiting below", section: 'verse' },
      { id: 'cs-7', startTimeMs: 22000, text: 'Devils roll the dice, angels roll their eyes', section: 'verse', annotationId: 'ann-cs-1' },
      { id: 'cs-8', startTimeMs: 25000, text: 'What doesn\'t kill me makes me want you more', section: 'verse' },
      { id: 'cs-9', startTimeMs: 28000, text: "And it's new, the shape of your body", section: 'chorus' },
      { id: 'cs-10', startTimeMs: 31000, text: "It's blue, the feeling I've got", section: 'chorus' },
      { id: 'cs-11', startTimeMs: 34500, text: "And it's ooh, whoa, oh", section: 'chorus' },
      { id: 'cs-12', startTimeMs: 38000, text: "It's a cruel summer", section: 'chorus' },
      { id: 'cs-13', startTimeMs: 41000, text: "It's cool, that's what I tell 'em", section: 'chorus' },
      { id: 'cs-14', startTimeMs: 44000, text: 'No rules in breakable heaven', section: 'chorus' },
      { id: 'cs-15', startTimeMs: 47500, text: 'It\'s a cruel summer with you', section: 'chorus' },
      { id: 'cs-16', startTimeMs: 78000, text: "I'm drunk in the back of the car", section: 'bridge', annotationId: 'ann-cs-2' },
      { id: 'cs-17', startTimeMs: 81000, text: 'And I cried like a baby coming home from the bar', section: 'bridge' },
      { id: 'cs-18', startTimeMs: 84000, text: 'Said, "I\'m fine," but it wasn\'t true', section: 'bridge' },
      { id: 'cs-19', startTimeMs: 87000, text: "I don't wanna keep secrets just to keep you", section: 'bridge' },
      { id: 'cs-20', startTimeMs: 90000, text: 'And I snuck in through the garden gate', section: 'bridge' },
      { id: 'cs-21', startTimeMs: 93000, text: 'Every night that summer just to seal my fate', section: 'bridge' },
      { id: 'cs-22', startTimeMs: 96000, text: 'And I screamed for whatever it\'s worth', section: 'bridge' },
      { id: 'cs-23', startTimeMs: 99000, text: '"I love you," ain\'t that the worst thing you ever heard?', section: 'bridge', annotationId: 'ann-cs-3' },
      { id: 'cs-24', startTimeMs: 104000, text: 'He looks up grinning like a devil!', section: 'bridge' },
    ],
    annotations: [
      {
        id: 'ann-cs-1',
        lineRef: 'Devils roll the dice, angels roll their eyes',
        header: 'Fate vs. Judgment',
        content: 'Taylor contrasts the thrilling gamble of secret romance with the weary cynicism of outside observers ("angels").',
        verifiedBy: 'Taylor Swift (Lover Secret Sessions)',
        votes: 4210,
      },
      {
        id: 'ann-cs-2',
        lineRef: "I'm drunk in the back of the car",
        header: 'The Legendary Eras Tour Bridge',
        content: 'Widely celebrated as one of the most explosive pop music bridges in modern history, performed with thousands of fans shouting in unison.',
        verifiedBy: 'Jack Antonoff & Genius Community',
        votes: 8900,
      },
      {
        id: 'ann-cs-3',
        lineRef: '"I love you," ain\'t that the worst thing you ever heard?',
        header: 'Vulnerability as Terror',
        content: 'Confessing love inside a casual relationship breaks the unwritten agreement. The fear is immediately dispelled when he grins like a devil.',
        verifiedBy: 'Genius Top Scholar',
        votes: 6150,
      },
    ],
    trivia: [
      'Co-written with St. Vincent (Annie Clark) and Jack Antonoff in Electric Lady Studios in NYC.',
      'Became Taylor\'s 10th Billboard Hot 100 #1 single four full years after its original 2019 release due to overwhelming viral streaming popularity on Amazon Music and TikTok.',
    ],
    trackInfo: {
      writers: ['Taylor Swift', 'Jack Antonoff', 'Annie Clark (St. Vincent)'],
      producers: ['Jack Antonoff', 'Taylor Swift'],
      releaseDate: 'August 23, 2019',
    },
  },
  'blinding-lights-the-weeknd': {
    songId: 'blinding-lights-the-weeknd',
    title: 'Blinding Lights',
    artist: 'The Weeknd',
    album: 'After Hours',
    albumArt: 'https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop',
    provider: 'Genius',
    plainLyrics: `Yeah
I've been tryna call
I've been on my own for long enough
Maybe you can show me how to love, maybe
I'm going through withdrawals
You don't even have to do too much
You can turn me on with just a touch, baby

I look around and Sin City's cold and empty
No one's around to judge me
I can't see clearly when you're gone

I said, ooh, I'm blinded by the lights
No, I can't sleep until I feel your touch
I said, ooh, I'm drowning in the night
Oh, when I'm like this, you're the one I trust`,
    syncedLyrics: [
      { id: 'bl-1', startTimeMs: 2500, text: '♪ (Iconic 80s synth riff intro) ♪', section: 'intro' },
      { id: 'bl-2', startTimeMs: 14000, text: 'Yeah', section: 'intro' },
      { id: 'bl-3', startTimeMs: 16500, text: "I've been tryna call", section: 'verse' },
      { id: 'bl-4', startTimeMs: 20200, text: "I've been on my own for long enough", section: 'verse' },
      { id: 'bl-5', startTimeMs: 24000, text: 'Maybe you can show me how to love, maybe', section: 'verse' },
      { id: 'bl-6', startTimeMs: 31500, text: "I'm going through withdrawals", section: 'verse', annotationId: 'ann-bl-1' },
      { id: 'bl-7', startTimeMs: 35000, text: "You don't even have to do too much", section: 'verse' },
      { id: 'bl-8', startTimeMs: 38800, text: 'You can turn me on with just a touch, baby', section: 'verse' },
      { id: 'bl-9', startTimeMs: 46200, text: "I look around and Sin City's cold and empty", section: 'verse', annotationId: 'ann-bl-2' },
      { id: 'bl-10', startTimeMs: 50200, text: "No one's around to judge me", section: 'verse' },
      { id: 'bl-11', startTimeMs: 54000, text: "I can't see clearly when you're gone", section: 'verse' },
      { id: 'bl-12', startTimeMs: 61500, text: "I said, ooh, I'm blinded by the lights", section: 'chorus', annotationId: 'ann-bl-3' },
      { id: 'bl-13', startTimeMs: 69000, text: "No, I can't sleep until I feel your touch", section: 'chorus' },
      { id: 'bl-14', startTimeMs: 76500, text: "I said, ooh, I'm drowning in the night", section: 'chorus' },
      { id: 'bl-15', startTimeMs: 84000, text: "Oh, when I'm like this, you're the one I trust", section: 'chorus' },
      { id: 'bl-16', startTimeMs: 91500, text: "Hey, hey, hey", section: 'bridge' },
    ],
    annotations: [
      {
        id: 'ann-bl-1',
        lineRef: "I'm going through withdrawals",
        header: 'Addiction & Co-dependency',
        content: 'Abel compares psychological yearning for an estranged partner to physical chemical withdrawal symptoms.',
        verifiedBy: 'The Weeknd (Billboard Cover Story)',
        votes: 3500,
      },
      {
        id: 'ann-bl-2',
        lineRef: "I look around and Sin City's cold and empty",
        header: 'Las Vegas Strip Imagery',
        content: 'Sin City refers to Las Vegas, setting of the After Hours visual narrative where neon decadence masks intense personal isolation.',
        verifiedBy: 'Genius Staff',
        votes: 2190,
      },
      {
        id: 'ann-bl-3',
        lineRef: "I said, ooh, I'm blinded by the lights",
        header: 'Speeding Down the Boulevard',
        content: 'The streetlights blinding a reckless late-night driver desperately rushing to meet someone before daybreak.',
        verifiedBy: 'Max Martin / Genius Verified',
        votes: 4980,
      },
    ],
    trivia: [
      'Ranked by Billboard as the #1 Greatest Hot 100 Hit of All Time, spending 90 consecutive weeks on the charts.',
      'Produced in Stockholm with legendary Swedish pop maestro Max Martin and Oscar Holter.',
    ],
    trackInfo: {
      writers: ['Abel Tesfaye', 'Max Martin', 'Oscar Holter', 'Ahmad Balshe', 'Jason Quenneville'],
      producers: ['Max Martin', 'Oscar Holter', 'The Weeknd'],
      releaseDate: 'November 29, 2019',
    },
  },
  'not-like-us-kendrick-lamar': {
    songId: 'not-like-us-kendrick-lamar',
    title: 'Not Like Us',
    artist: 'Kendrick Lamar',
    album: 'Not Like Us - Single',
    albumArt: 'https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&h=300&fit=crop',
    provider: 'Genius',
    plainLyrics: `Psst, I see dead people
Mustard on the beat, ho
Deebo, any rap nigga, he a free throw
Man down, call an amberbulance, tell him, "Breathe, bro"
Nail a nigga to the cross, he walk around like Teezo
What's up with these jabroni-ass niggas tryna see Compton?
The audience not dumb
Shape the stories how you want, hey, Drake, they're not slow
Rabbit hole is still deep, I can go further, I promise
They not like us, they not like us, they not like us
They not like us, they not like us, they not like us`,
    syncedLyrics: [
      { id: 'nlu-1', startTimeMs: 1200, text: 'Psst, I see dead people', section: 'intro', annotationId: 'ann-nlu-1' },
      { id: 'nlu-2', startTimeMs: 4800, text: 'Mustard on the beat, ho', section: 'intro' },
      { id: 'nlu-3', startTimeMs: 8200, text: 'Deebo, any rap nigga, he a free throw', section: 'verse' },
      { id: 'nlu-4', startTimeMs: 11800, text: 'Man down, call an amberbulance, tell him, "Breathe, bro"', section: 'verse' },
      { id: 'nlu-5', startTimeMs: 15500, text: 'Nail a nigga to the cross, he walk around like Teezo', section: 'verse', annotationId: 'ann-nlu-2' },
      { id: 'nlu-6', startTimeMs: 19500, text: "What's up with these jabroni-ass niggas tryna see Compton?", section: 'verse' },
      { id: 'nlu-7', startTimeMs: 23500, text: 'The audience not dumb', section: 'verse' },
      { id: 'nlu-8', startTimeMs: 27000, text: "Shape the stories how you want, hey, Drake, they're not slow", section: 'verse' },
      { id: 'nlu-9', startTimeMs: 31000, text: 'Rabbit hole is still deep, I can go further, I promise', section: 'verse' },
      { id: 'nlu-10', startTimeMs: 35000, text: 'They not like us, they not like us, they not like us', section: 'chorus', annotationId: 'ann-nlu-3' },
      { id: 'nlu-11', startTimeMs: 39000, text: 'They not like us, they not like us, they not like us', section: 'chorus' },
      { id: 'nlu-12', startTimeMs: 43000, text: 'Sometimes you gotta pop out and show niggas', section: 'verse' },
      { id: 'nlu-13', startTimeMs: 46800, text: 'Certified Lover Boy? Certified pedophile', section: 'verse' },
      { id: 'nlu-14', startTimeMs: 50500, text: 'Wop, wop, wop, wop, wop, Dot, fuck \'em up', section: 'verse' },
      { id: 'nlu-15', startTimeMs: 54000, text: 'Wop, wop, wop, wop, wop, I\'ma do my stuff', section: 'verse' },
      { id: 'nlu-16', startTimeMs: 58000, text: 'Why you trollin\' like a bitch? Ain\'t you tired?', section: 'verse' },
      { id: 'nlu-17', startTimeMs: 61500, text: 'Tryna strike a chord and it\'s probably A-Minorrrrr', section: 'verse', annotationId: 'ann-nlu-4' },
    ],
    annotations: [
      {
        id: 'ann-nlu-1',
        lineRef: 'Psst, I see dead people',
        header: 'The Sixth Sense & DJ Kay Slay Homage',
        content: 'Kendrick opens with the famous line whispered by Haley Joel Osment in The Sixth Sense (1999), signaling he is speaking over the ghosts of rap competitors.',
        verifiedBy: 'Genius Hip-Hop Community',
        votes: 11400,
      },
      {
        id: 'ann-nlu-2',
        lineRef: 'Nail a nigga to the cross, he walk around like Teezo',
        header: 'Teezo Touchdown Aesthetic Reference',
        content: 'Teezo Touchdown is known for wearing real construction nails adorned in his hair and braids, combined with religious crucifixion imagery.',
        verifiedBy: 'Rap Genius Editors',
        votes: 7800,
      },
      {
        id: 'ann-nlu-3',
        lineRef: 'They not like us, they not like us, they not like us',
        header: 'The Cultural Anthem Refrain',
        content: 'Distinguishes genuine West Coast community roots and hip-hop ethos from commercial opportunism.',
        verifiedBy: 'Top Rap Scholars',
        votes: 15200,
      },
      {
        id: 'ann-nlu-4',
        lineRef: "Tryna strike a chord and it's probably A-Minorrrrr",
        header: 'Musical Pun of the Decade',
        content: 'A triple entendre linking musical composition chords, the key of A minor, and the statutory age allegations leveled against Drake.',
        verifiedBy: 'Genius Hall of Fame',
        votes: 28400,
      },
    ],
    trivia: [
      'Broke the all-time record for most single-day hip-hop streams in Spotify and Amazon Music history.',
      'Produced by DJ Mustard, sampling Ray Charles\' "I Believe to My Soul".',
    ],
    trackInfo: {
      writers: ['Kendrick Lamar', 'Dijon McFarlane (Mustard)'],
      producers: ['Mustard', 'Sounwave'],
      releaseDate: 'May 4, 2024',
    },
  },
};
