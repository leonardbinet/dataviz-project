# Visualization of Transilien's network delays

## Overview

This repository is part of a project with SNCF R&D department to provide predictions of delays over Transilien's railroad network. This work is an attempt to visualize and understand how delays occur.

The main tool is a map of the network (graph) made of stations and routes. 

## Screenshots

![Map-focus](images/map-focus.png)
![Datatables](images/datatable.png)
![Delays](images/delay-vs-nb-active-trains.png)
![Map](images/map.png)

## The main steps

### Data preprocessing
- Preprocess trains stops times and delays in right format.
- Preprocess stations data in right format.
- Create JSON file describing graph egdes between stations.

### Vizualization initialization
- Parse data.
- Create graphs.
- Preprocess trains' trips to find shortest path and extrapolate missing data about delays.
- Preprocess summary of trains' delays.
- Render interaction tools (sliders/buttons).
- Render initial map: stations, subsections.
- Render initial datatable.
- Render graph of delays over day.

### Rendering at each time change
- Compute active trips state.
- Compute network state.
- Render trains.
- Render subsections jams.
- Render datatable.

## Credits
The amazing work done by Michael Barry and Brian Card on the  [MBTA](http://mbtaviz.github.io/) has inspired me. Both for visual conception, and some tricky parts of code for geometrical calculations.

I also used the following javascript libraries: es6-shim, underscore, moment, d3, c3, jquery, bootstrap, datatables.

## Source code and raw data
Source code is available here on github.
Raw data comes from:
- Transilien gtfs files on their website
- Extraction of their API I made available on an AWS S3 container here.