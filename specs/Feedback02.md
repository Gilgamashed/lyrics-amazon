Testers have returned this feedback:

Issues:
    "Most listened" should only count amazon music songs
    The main lyrics window bar containing song name, karaoke/full sheet tabs needs to be fixed and always visible.
    The main lyrics box needs a scroll bar for both karaoke and full sheet tabs
    there was no report of a succesful album art being shown - only the standard fall back
    When the lyric was provided by genius, it was often the case that karaoke mode would be unavailable.
    The karaoke mode lyrics seems to get stuck after 3 minutes
    Sometimes the app simply repeats the last played lyric while a new song is playing
    There were some issues getting the correct song name/artists
        often times the app tried to retrieve "Artist name" as song name.
        Sometimes the artist name could not be retrieved, displayed as "Unknown Artist"
    Some songs seem to don't even attempt to search for lyrics (ex: Rasa by oktobernatt, talk by periphery, howl by the family crest, sabada by filous) This behaviour is consistent and can be reproduced.


Improvements:
    More lyrics provider options such as Lyrica API
    Move Genius down the list of providers (does not natively host time-synced lyrics)
    An option to manually fix incorrect artist/song name and perform an updated search through the providers0
    a simple system in which users can turn static lyrics from providers into parsed synced karaoke themselves with AI (which would be saved permanently)
        1 - fetch the unsynced text
        2 - pass the song audio track through an open-source audio-to-text alignment model like Whisper on hugging face or Meteo
        3 - merge the data and save