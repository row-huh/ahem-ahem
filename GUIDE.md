# Karachi Bus Guide: how it works

A guide to what was built, how the pieces fit, and how the app decides which buses to suggest.

## 1. What it is

A website where a person gives a start, a destination and optionally more stops in between, and sees every reasonable way to do the trip on the Sindh Mass Transit network: Peoples Bus (R-routes), the Double Decker, EV buses, and the Green and Orange BRT lines. It also covers 24 private bus and coach routes that a regular rider confirmed are still running.

It deliberately does not show travel or waiting times, because nobody publishes a timetable for these buses and any number would be invented.

## 2. The big picture

There are two halves, and they run at different times.

```
 ONCE, ON MY COMPUTER (npm run build:data)          EVERY TIME SOMEONE OPENS THE SITE
 ------------------------------------------         ---------------------------------
 hand-written stop list  ─┐                         browser downloads network.json
 hand-written line list  ─┼─> scripts/build.mjs ──>   │
 OpenStreetMap lookups   ─┘        │                  ├─ draws the map (Leaflet + OSM tiles)
                                   v                  ├─ plans trips (js/router.js)
                         data/network.json            └─ shows results (js/app.js)
                         data/places.json
```

- **There is no server doing any thinking.** The whole network is one small file. The person's phone downloads it and does all the route planning itself. That makes the site cheap to host and keeps it working on a weak connection.
- **There is no database and no login.**
- **No AI.** Everything is ordinary arithmetic on distances.

## 3. What OpenStreetMap is used for

OpenStreetMap (OSM) is a free, public map of the world. We use four separate services that are built on it:

| Job | Service | When |
|---|---|---|
| The map picture in the background | OSM map tiles | Live, in the browser |
| Finding where a named stop is | Nominatim, plus OSM's list of about 1,100 Karachi bus stops | Once, at build time |
| Drawing a line along real roads between stops | OSRM (a road routing engine) | Once, at build time |
| Searching for a place someone types ("Aga Khan Hospital") | Photon | Live, in the browser |

**Leaflet** is the small library that shows the map on screen and lets us draw lines and pins on top of it.

OSM does not know Karachi's bus routes. It only gave us the map, the roads and some stop locations. The routes themselves came from SMTA's website and route map and were typed in by hand.

## 4. Where the data comes from

Two hand-written files are the source of truth:

- `data/source/stops.mjs`: 262 stops, each with an English name, an Urdu name and a rough position.
- `data/source/lines.mjs`: the 19 Sindh Mass Transit lines, each an ordered list of stops, plus the fare rules.
- `data/source/private-lines.mjs`: the 24 confirmed private routes.

Two more files are kept for reference and are not used by the website:

- `data/source/private-routes.json`: all 344 entries of the January 2010 route list, each marked valid, changed, defunct or unknown from the rider's marks.
- `data/source/travel-culture-routes.json`: the 69 routes written out on travel-culture.com. That page says its text may not be copied without permission, and its date is not confirmed.

`scripts/build.mjs` turns those into the file the website uses, in three steps.

1. **Place each stop.** It looks the stop's name up in OSM. If OSM has a match within 1.5 km of my rough position, the stop takes OSM's position and is marked *matched*. Otherwise it keeps my rough position and is marked *approximate*. Approximate stops are drawn with a dashed outline and flagged in the directions.
2. **Draw each line.** For each pair of neighbouring stops it asks OSRM for the road path between them, so the line follows the real road, not a straight ruler line. It then cleans up the cases where the road engine goes the wrong way round a divided road.
3. **Measure.** It records the road distance between every pair of neighbouring stops. These distances are what the planner uses.

It also compares each drawn line's length with the length SMTA publishes and prints a warning when they differ by more than 20%.

## 5. How the app decides the way from A to B

This lives in `js/router.js`, about 200 lines.

### Step 1: which stops can you reach?

From the start point it finds every stop within 1.5 km. If nothing is that close, it widens the circle until it catches the nearest stops. It does the same around the destination.

Walking distance is estimated as the straight-line distance times 1.3, because streets are never straight.

### Step 2: try the combinations

There are only 43 lines, so the app can afford to try everything:

- every single line (a direct trip),
- every pair of lines that meet (one change),
- every chain of three lines (two changes).

Two lines "meet" if they share a stop, or have stops within 400 m of each other. More than two changes is never offered.

For each combination it picks the best place to get on, change and get off.

### Step 3: score each one

Every option gets one number, its **effort**. Lower is better.

```
effort = metres on the bus
       + 6 x metres on foot
       + 4,000 for every change of bus
```

So one metre of walking counts as much as six metres of riding, and changing buses counts the same as 4 km of extra riding. Those two numbers are judgment calls of mine. They encode "people would rather sit on a bus a bit longer than walk far or change buses".

### Step 4: tidy up

- Options that ride through exactly the same stops on different lines are merged into one ("take R1, R9 or EV1").
- Options far worse than the best one are dropped.
- An option with an extra change is kept only if the change buys something: at least 300 m less walking or a trip at least 20% shorter.
- At most eight options are shown.
- If the whole trip is under 1.5 km, "just walk" is added.

### Step 5: the honest parts

- If getting to or from a stop is more than 1 km, that stretch is shown as "take a rickshaw or chinchi", not as a walk.
- Fares are worked out from the bus distance: about Rs 80 up to 15 km and Rs 120 beyond for Peoples Bus. EV and BRT fares are shown as not confirmed.

### Step 6: sorting

The default order is fewest changes. The buttons re-sort the same options by least walking, shortest distance or cheapest. They do not find new options.

### Trips with several stops

A → B → C is planned as two separate trips, A → B and then B → C, and shown one after the other.

## 6. How Google Maps does it, and how this differs

Google's approach has the same skeleton but much more data behind it.

**For driving and walking.** The road map is stored as a *graph*: every junction is a dot, every stretch of road is a link with a cost (the time to travel it). Finding a route means finding the cheapest chain of links from A to B. The classic method is **Dijkstra's algorithm**: spread outwards from the start, always extending the cheapest path found so far, until you reach the destination. On a map the size of a country that is too slow, so the map is pre-processed overnight to add shortcuts ("from this motorway junction to that one is 14 minutes"), a technique called **contraction hierarchies**. That is how a route across a continent comes back in a fraction of a second. Live traffic is added by changing the link costs using speeds reported by phones on the road.

**For public transport.** Transit agencies give Google a timetable in a standard format called **GTFS**: every stop, every route and every departure time. With that, the question changes from "what is the shortest path" to "what is the earliest I can arrive". The well-known published methods are **RAPTOR** (work in rounds: where can I get with one vehicle, then with two, then with three) and the **Connection Scan Algorithm** (run through every departure in time order). Google's own published work on this is called **transfer patterns**. Google's exact production system is not public, so treat this as the family of methods, not a description of their code.

**How ours compares.**

| | Google Maps | This app |
|---|---|---|
| Timetables | Yes, from GTFS | None exist for these buses |
| What it optimises | Arrival time | Effort: distance, walking and changes |
| Method | Rounds over timetables | Try every combination of up to three lines |
| Why that works | Built for millions of departures | Only 43 lines, so trying everything is instant |
| Walking | Routed along real footpaths | Straight line times 1.3 |
| Live information | Traffic and vehicle positions | None |

Our method is closest in spirit to RAPTOR: both think in terms of "how many vehicles do I need". The difference is that RAPTOR knows when each bus leaves and we do not.

If Karachi's buses ever get a published timetable, or if we collect one ourselves, the data can be converted to GTFS and the planner swapped for a time-based one without changing the rest of the site.

## 7. The files

| File | What it does |
|---|---|
| `index.html`, `css/style.css` | The page and its looks. Phone layout first; side panel on wide screens |
| `js/app.js` | Everything on screen: map, pins, search boxes, result cards, route list |
| `js/router.js` | The trip planner described in section 5 |
| `js/search.js` | Place search: local stop names first, then Photon online |
| `js/i18n.js` | All English and Urdu wording |
| `js/geo.js` | Distance arithmetic |
| `data/source/stops.mjs`, `lines.mjs` | The hand-written network. Edit these to fix data |
| `scripts/build.mjs` | Turns the source files into `data/network.json` |
| `data/network.json`, `places.json` | What the website actually loads |
| `scripts/serve.mjs` | A tiny local web server for trying the site |
| `test/router.test.mjs` | Automated checks of the planner |

Commands: `npm start` runs the site at http://localhost:5173, `npm run build:data` rebuilds the data after an edit, `npm test` runs the checks.

## 8. Known limits

- **93 of 262 stop positions are approximate.** They need checking by someone who knows the stop. Most of the new private-route stops are in this group.
- **Private routes are thinned out.** The 2010 list mixes stops, roads and whole neighbourhoods. Only names that could be tied to a place were kept, so a private bus may stop in more places than the app shows. They rest on one rider's word.
- **Some drawn lines are longer or shorter than SMTA's figures** (R2, R3, R8, R12, EV3, EV4, EV5). A wrong length can put a trip in the wrong fare band.
- **Every line is assumed to run both ways through the same stops.** One-way sections are not modelled.
- **Stops are assumed to be where the bus actually stops.** In practice people flag buses down between stops.
- **Fares are from 2025 press reports**, not from SMTA.
- **The effort weights (6x walking, 4 km per change) are my estimates**, not measured from riders.
- **The free OSM map and search servers are fine for a prototype** but are not meant for a public launch with many users. That needs a paid or self-hosted map provider.
- **Chinchis are not included, and neither are the 266 private routes nobody has checked.**
