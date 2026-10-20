Testers have returned this feedback:

String Normalization & Fuzzy Matching

    The Blind Spot: Exact string matching fails constantly because song titles include metadata like (Remastered 2011), [Explicit] feat. Artist X, or punctuation differences.

    The Fix: Build a robust normalization pipeline before querying APIs (e.g., stripping parentheses, lowercasing, removing featuring credits, and handling special characters) alongside fuzzy string matching (like Python's thefuzz or JavaScript equivalent).

If the user manualy fixes a particular song's name or artist, link it to the currently song being played for future reference.

Make sure saved and cached lyrics are loaded before checking for online sources

Window geometry — position and size should be stored and remembered