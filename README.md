# hockeyPracticeDrills
Web-based hockey drills and practice creator

# Purpose

This project provides a free, accessible hockey drill creator specifically designed for youth house leagues. The goal is to empower coaches with a professional-grade tool to plan effective practices and collaborate on strategies. By facilitating the sharing of drills and teaching resources, this tool aims to elevate the coaching standard across the entire league, ensuring a better developmental experience for every child on the ice.

# Requirements (for now)
To be able to:

1) Draw drills on a canvas including:
   - Half and full-sized rink
   - Different line strokes (for skating, passing, shooting, etc...)
   - Nets, of various sizes
   - Pylons
   - Position players
   - Various other shapes

2) Save drills as a JSON and in the backend to use later and share

3) Create a practice as a set of drills

4) Mobile use: Draw easily on a mobile device (probably a tablet), and put together practices easily

# Getting started

1. Download or clone the repo. 

2. Install the python requirements using `pip install -r requirements.txt`

3. Create the coaching list at `src/coaches.json`. This file is intended to be be private and not shared. The format should look like

```json
{
  "allow_self_register": false,
  "coaches": [
      "Coach Smith",
      "Coach Canuck"
  ]
}
```

4. Start the server by running `python src/main.py`
