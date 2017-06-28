(function (global) {
    "use strict";
    /*
    TODO: detail main steps
    */
    
    // DATA PARSING FUNCTIONS
    function parseStation(d,i) {
        // returns only for given line
        if (d[global.line]){
            return {
                uic8: d.Code_UIC,
                uic7: d.UIC7,
                stop_id: d.stop_id,
                lat: +d.stop_lat,
                lon: +d.stop_lon,
                name: d.stop_name,
                linkedSections:[],
                linkedSubSections:[]

            }
        }
    }

    function parseSection(d,i) {
        // Extract stop_ids (we don't keep names, they are useful for conception/debugging only)
        var points= d.points.map(function(o){return Object.keys(o)[0]});
        // Replace by real stations objects
        var points = points.map(global.stopIdToStop);
        var endPoints = [points[0],points[points.length - 1]];
        var subsections = [];
        for (var p=0; p<points.length-1;p++){
            var subsection = {
                from: points[p],
                to: points[p+1],
                name: points[p].name +" -> "+ points[p+1].name,
                distance: stationsDistance(points[p],points[p+1]),
                atTime: {
                    renderedAtTime: null,
                    observed: {
                        // at current time
                        dir0: [],
                        dir1: [],
                        // with some cached from last minutes
                        cachedDir0:[],
                        cachedDir1:[]
                    },
                    scheduled: {
                        // at current time
                        dir0: [],
                        dir1: [],
                        // with some cached from last minutes
                        cachedDir0:[],
                        cachedDir1:[]
                    }
                }
            };
            subsections.push(subsection);
        }
        var section = {
            name: d.name,
            endPoints: endPoints,
            points: points,
            subsections: subsections,
            nbStations: points.length,
            // returns {lon:, lat:}
            pointsCoord: points.map(function(station){
                return {
                    lon: station.lon,
                    lat: station.lat
                };
            })
        };
        return section;
            
    }

    function parseTrip(d,i) {
        // if >10000, it is an error of date parsing
        var secs = +d.end - +d.begin;
        if (secs>10000){return;}
        
        var stops = d.stops.map(function(stop){
            var fullStop = {};
            // checks if stop_id is among imported stations
            var realStop = global.stopIdToStop(stop.stop_id);
            if (!realStop){ 
                // if not stop is ignored and trip is added to errors
                global.errors.notFoundStops[stop.stop_id].push(d);
                return; 
            }
            fullStop.stop = realStop;
            fullStop.scheduledTime = +stop.time;
            if (stop.delay){
                fullStop.delay = +stop.delay;
                // if error of one day
                fullStop.delay = fullStop.delay % 86400;
                if (fullStop.delay>5000){
                    console.log("Info: delay>5000 secs observed: "+fullStop.delay);
                }
            }
            fullStop.realStop = true;
            return fullStop;
        });
        
        stops = stops.filter(function(stop){return !!stop; })
        if (stops.length<2){
            console.log("Added "+d.trip+" to trips with errors (less than 2 stations identified).");
            return;
        }
        var result = {
                begin: +d.begin,
                end: +d.end,
                line: d.line,
                trip: d.trip,
                stops: stops,
                secs: secs
        };
        return result;
    }
    
    function parseDatatableTrain(type, train){
        // type is either "observed" or "scheduled"
        // Subsection name
        var cfrom = train.atTime[type].from.name;
        var cto = train.atTime[type].to.name;
        var subsection = cfrom+" -> "+cto;

        // From
        var from = train.stops[0].stop.name;
        // To
        var to = train.stops[train.stops.length-1].stop.name;

        var estimatedDelay = Math.floor(train.atTime[type].estimatedDelay);
        if ("undefined" === typeof estimatedDelay) {estimatedDelay="nan"}

        return {
            trip: train.trip,
            estimatedDelay: estimatedDelay,
            from: from,
            to: to,
            subsection: subsection
        };
    }
    
    // TRAIN ACTIVE FUNCTIONS
    function isActiveScheduled(unixSeconds, train){
        return (train.begin < unixSeconds && train.end > unixSeconds)
    }
    
    function isActiveObserved(unixSeconds, train){
        return (train.ObservedBegin < unixSeconds && train.ObservedEnd > unixSeconds)
    }

    // DRAWING FUNCTIONS
    function renderAllAtTime(unixSeconds, transitionDisabled){
        
        /* Find all active, notYet, and finished trains:
        - either based on schedule
        - either based on observations
        */
        
        var type; // two options: either scheduled, or observed
        
        // checks time and transition time
        
        if (global.displayScheduled){
            global.active = global.trips.filter(function (d) {
                return isActiveScheduled(unixSeconds, d) ;
            });
            
            global.finished = global.trips.filter(function (d) {
                return (d.end < unixSeconds) ;
            });   
            
            global.notYet = global.trips.filter(function (d) {
                return (d.begin > unixSeconds) ;
            });
            
            type = "scheduled"; 
            
        }
        if (global.displayObserved){
            global.active = global.trips.filter(function (d) {
                return isActiveObserved(unixSeconds, d) ;
            });
            
            global.finished = global.trips.filter(function (d) {
                return (d.ObservedEnd < unixSeconds) ;
            });   
            
            global.notYet = global.trips.filter(function (d) {
                return (d.ObservedBegin > unixSeconds) ;
            }); 
            
            type = "observed"; 

        }
        
        // FIND TRAINS POSITIONS
        global.positionedTrains = global.active
            .map(setTrainsPositions.bind(this, unixSeconds))
            .filter(function(train){
                if (!train){return; }
                if (train.atTime.scheduled.pos && train.atTime.scheduled.acceptedEdge && global.displayScheduled){return train; }
                if (train.atTime.observed.pos && train.atTime.observed.acceptedEdge && global.displayObserved){return train; }
            });
        
        infoPanel();
        
        drawTrainsAtTime(unixSeconds, transitionDisabled);
        
        // Compute and render delays evolution
        global.sectionMan.refreshAtTime(unixSeconds);
        global.renderJam(transitionDisabled);
        
        // Table of active trains
        global.activeDatatableFormat = global.active.map(parseDatatableTrain.bind(this, type));
        global.updateTableData(global.activeDatatableFormat);
        
        // Finds from global variable which train to focus on
        if (global.focusedTrip){
            global.position
        }
        //global.drawTripFocus();
        global.updateTrainFocus(global.selectedTrip);
    }
    
    function drawStations(stations) {
        global.svg.selectAll(".station")
            .data(stations, function(d){return d.stop_id})
            .enter()
            .append("circle")
            .attr("cx", function(d){return d.lon})
            .attr("cy", function(d){return d.lat})
            .attr("r", 4)
            .classed("hoverable station", true)
            .on('mouseover', hoverStation)
            .on('mouseout', unHoverStation)
            .on('click', function(d){console.log(d);})
    }
    
    function drawSections(sects) {
        // ONLY PATHS: necessary to compute path length
        // function computing svg path
        var lineFunction = d3.svg.line()
            .x(function(d) { if (d) {return d.lon; }})
            .y(function(d) { if (d) {return d.lat; }})
            .interpolate("cardinal");
        
        global.svg.selectAll(".section")
            .data(sects, function(d){return d.name})
            .enter()
            .append("path")
                .attr("d", function(d){return lineFunction(d.pointsCoord)})
                .classed("section", true)
                .on("click", function(d){console.log('Section '+d.name)})
                .each(function(d) { d.totalLength = this.getTotalLength(); });
    }
    
    function drawSectionsJamAtTime(unixSeconds, transitionDisabled){
        /*
        1 - Draw subsections rectanges for each direction: rectangle
        representing delays of near/passed trains at given station for a given direction
        (information must be PER STATION PER DIRECTION, symetric for adjacent subsections on given direction)
        2 - Draw subsections flow paths for each direction: curve
        representing number/density of trains per subsection
        3 - Render color of rectangle + curve: representing evolution of delays of trains passed by this station
        */
        
        // STEP 1
        // First find stations widths
        var stationsWidths = global.stations.map(function(station){
            var dir0Data = stationWeightedLastDelays(station.stop_id, "dir0", 300);
            var dir1Data = stationWeightedLastDelays(station.stop_id, "dir1", 300);
            return {dir0: dir0Data, dir1: dir1Data};
        });
        // Then draw it
    }
    
    function drawTrainsAtTime(unixSeconds, transitionDisabled) {
        
        // ARGS PARSING
        var ttime = global.transitionTime;
        if (transitionDisabled){ttime=0;}
        
        
        // DISPLAY TRAINS
        var trainsGroups = global.svg.selectAll('.train')
            .data(global.positionedTrains, function (d) { return d.trip; });
        
        if (global.displayObserved){
            // OBSERVED
            
            // Update
            trainsGroups
                .transition()
                .duration(ttime)
                .attr('cx', function (d) { return d.atTime.observed.pos[0]; })
                .attr('cy', function (d) { return d.atTime.observed.pos[1]; })
                .attr("fill", function(d) {return global.delayMapColorScale(d.atTime.observed.estimatedDelay); })
                .attr("r", global.mapGlyphTrainCircleRadius-0.5)
                .attr("opacity", global.displayObserved)
            
            // Enter
            trainsGroups.enter().append('circle')
                .attr('class', function (d) { return 'highlightable hoverable dimmable ' + d.line; })
                .classed('active', function (d) { return d.trip === global.highlightedTrip; })
                .classed('hover', function (d) { return d.trip === global.hoveredTrip; })
                .classed("train", true)
                .classed("observed", true)
                .on('mouseover', hoverTrain)
                .on('mouseout', unHoverTrain)
                .on("click", selectTrain)
                .attr("r", 2)
                .attr("opacity", global.displayObserved)
                .attr("fill","lightgreen")
                .attr('cx', function (d) {return d.stops[0].stop.lon;})
                .attr('cy', function (d) {return d.stops[0].stop.lat;});
            
        }
        
        else {
            // SCHEDULE
            // Update
            trainsGroups
                .transition()
                .duration(ttime)
                .attr('cx', function (d) { return d.atTime.scheduled.pos[0]; })
                .attr('cy', function (d) { return d.atTime.scheduled.pos[1]; })
                .attr("fill", "steelblue")
                .attr("r", global.mapGlyphTrainCircleRadius-0.5)
                .attr("opacity", global.displayScheduled)
            
            // Enter
            trainsGroups.enter().append('circle')
                .attr('class', function (d) { return 'highlightable hoverable dimmable ' + d.line; })
                .classed('active', function (d) { return d.trip === global.highlightedTrip; })
                .classed('hover', function (d) { return d.trip === global.hoveredTrip ; })
                .classed("train", true)
                .classed("scheduled", true)
                .on('mouseover', hoverTrain)
                .on('mouseout', unHoverTrain)
                .on("click", function(d){console.log(d);})
                .attr("r", 2)
                .attr("opacity", global.displayScheduled)
                .attr("fill","lightgreen")
                .attr('cx', function (d) {return d.stops[0].stop.lon;})
                .attr('cy', function (d) {return d.stops[0].stop.lat;});
        }
        
        // Exit
        trainsGroups.exit()
            .transition()
            .duration(ttime)
            // first finish till last station then disapear
            .attr('cx', function (d) {return d.stops[d.stops.length-1].stop.lon; })
            .attr('cy', function (d) {return d.stops[d.stops.length-1].stop.lat; })
            .attr("fill","grey")            
            .attr("r", 3)
            .remove()
    }
    
    function drawStationsNames(stations){
        global.svg.selectAll("station-name")
            .data(stations)
            .enter()
            .append("text")
                .classed("station-name", true)
                .attr("opacity", function(d){return global.visibleStations.find(function(st){return st.id === d.stop_id}) ? 1 : 0;})
                .text(function(d){return d.name})
                .attr("id", function(d){return d.stop_id.slice(10);})
                .attr("text-anchor", function(d){
                    var station = global.visibleStations.find(function(st){return st.id === d.stop_id});
                    var reverse; 
                    if (station){reverse = station.reverse; }
                    return reverse? "end" : "start";
                    })
                .attr("transform", function(d){
                    var station = global.visibleStations.find(function(st){return st.id === d.stop_id});
                    var reverse; 
                    if (station){reverse = station.reverse; }
                    var offset = reverse? -5 : 5;
            return "translate("+(d.lon + offset)+","+d.lat+") rotate(-15)"
                    })
    }
    
    // POSITION AND NETWORK FUNCTIONS  
    function networkPreprocessing(){
        // Assign sections and subsection to stations
        global.sections.forEach(function(section){
            // for each section
            section.points.forEach(function(station){
                if (!station.linkedSections.includes(section)){station.linkedSections.push(section);}
            });
            section.subsections.forEach(function(subsection){
                // for each subsection
                var fromStation = subsection.from;
                var toStation = subsection.to;
                if (!fromStation.linkedSubSections.includes(subsection)){fromStation.linkedSubSections.push(subsection);}       
                if (!toStation.linkedSubSections.includes(subsection)){toStation.linkedSubSections.push(subsection);}       

            });
        });
        
        // create graph of with only main nodes and sections
        /*
        global.mainGraph = new global.Graph();
        global.sections.forEach(function(section){
            var beginNode = section.endPoints[0];
            var endNode = section.endPoints[1];
            global.mainGraph.addEdge(beginNode, endNode);
        });
        console.log("Main graph created.");
        */
        
        // create graph of all stations (small nodes) and subsections
        global.preciseGraph = new global.Graph();
        global.sections.forEach(function(section){
            for (var l=0; l<section.points.length-1; l++){
                var beginNode = section.points[l].stop_id;
                var endNode = section.points[l+1].stop_id;
                global.preciseGraph.addEdge(beginNode, endNode);
            }
        }
        );
        console.log("Precise graph created.");
        
        // Create sections manager
        global.sectionMan = new global.SectionManager();

    }
      
    function preprocessTrainPathWithTime(train){
        /* The goal is to find (station, time) of all stations for which the train doesn't stop.
        
        A- Find passed stations without stop
        The first part is to know by which stations a train has passed, even if it doesn't stop at these stations
        it will add for each station the shortest path to the next station (array of stations at which it doesn't stop).
           {nextStations = []}
        
        B- Guess at what time the train will pass them
        Then it will have to extrapolate at what time the train is supposed to pass at these stations:
        - first calculate total time from initial station to next station: OK
        - find total distance between these stations, passing by found path: OK
        - assign to each subsection a spent time: OK
        - calculate timestamp: OK
        
        Add guessed stops in stops: array of:
        {
            stop_id:"***",
            time: ***
        }
        
        C- Build concatenated path
        */
        
        for (var i=0; i<train.stops.length-1; i++){
            var fromStop = train.stops[i];
            var toStop = train.stops[i+1];
            
            // Find path between two consecutive stops
            fromStop.nextPath=global.preciseGraph.shortestPath(fromStop.stop.stop_id, toStop.stop.stop_id)
                .map(global.stopIdToStop);
            
            // If no station passed without stop, or error trying to find: finished
            if (!fromStop.nextPath){continue;}
            if (fromStop.nextPath.length===0){continue;}
            
            // Else find time spent between stops
            fromStop.sectionTimeSecs = toStop.scheduledTime - fromStop.scheduledTime;
            
            // Find total distance between stops
            // Sum of all subsections, and list of subsections distances
            var totalDistance = 0;
            var distancesList = [];
            // add beginning and end
            var iniDist = stationsDistance(fromStop.stop, fromStop.nextPath[0]);
            totalDistance += iniDist
            distancesList.push(iniDist);
            var endDist = stationsDistance(toStop.stop, fromStop.nextPath[fromStop.nextPath.length-1]);
            totalDistance += endDist;
            // distancesList.push(endDist);
            for (var m=0; m<fromStop.nextPath.length-1;m++){
                var subsectionDistance = stationsDistance(fromStop.nextPath[m], fromStop.nextPath[m+1]);
                distancesList.push(subsectionDistance);
                totalDistance += subsectionDistance;
            }
            // Assign "distanceTillNextStop" to train's last stop
            fromStop.distanceTillNextStop = totalDistance;
            
            // Assign ratio of distance for each subsection to train's last stop
            fromStop.ratioList = cumulativeSum(distancesList.map(function(d){return d/totalDistance;}));
            // assign spent time to ...
            var timeList = fromStop.ratioList.map(function(r){return r*fromStop.sectionTimeSecs;})
            // and finally assign Timestamp: seconds + initial timestamp to ...
            fromStop.timestampList = timeList.map(function(t){return t+fromStop.scheduledTime;})
            
        }
        
        /* Build concatenated path
        By simply adding stations without stops to train path.
        
        for a given train, for each stop in its stops, add array to stops:
        {
            stop_id: "***",
            time: "***",
            realStop: false
        }
        
        */
        var guessedStops = [];
        train.stops.forEach(function(stop){
            // find guessed passed stations
            // if not found stop
            if (!stop.nextPath){return;}
            
            for (var h=0; h<stop.nextPath.length; h++){
                var g= {
                    stop: stop.nextPath[h],
                    scheduledTime: stop.timestampList[h],
                    realStop: false
                };
                guessedStops.push(g);
            };
        });
        train.stops = train.stops.concat(guessedStops);
        // Order stop by time (necessary for positioning functions)
        train.stops = _.sortBy(train.stops, function(o) { return o.scheduledTime; });
        
        /* Reassign lastObservedDelay to each station (real stop or not)
        Note: this is exactly the same operation as in parsing trips.
        The reason why we do it also in parsing, it that it allows us to define real beginning of trip (with delays), 
        and real end.
        We might do all here (and delete it in parsing operation).
        
        TODO: smoothen delay estimation based on next observed delay, so that if there are several subsections between 
        observed delays then it doesn't change at the last subsection.
        
        */ 
        for (var j=0; j<train.stops.length; j++){
            if (j===0){
                train.stops[0].estimatedDelay = train.stops[0].delay || 0;
                train.stops[0].estimatedTime = train.stops[0].scheduledTime + train.stops[0].estimatedDelay;
                continue;
            }
            // estimatedDelay is this stop delay, or if not exists estimatedDelay of previous stop
            train.stops[j].estimatedDelay = train.stops[j].delay || train.stops[j-1].estimatedDelay;
            train.stops[j].estimatedTime = train.stops[j].scheduledTime + train.stops[j].estimatedDelay;
        }
        
        // Find begining and end based on observed times
        // ObservedBegin, ObservedEnd
        train.ObservedBegin = _.min(train.stops, function(stop){return stop.estimatedTime}).estimatedTime;
        train.ObservedEnd = _.max(train.stops, function(stop){return stop.estimatedTime}).estimatedTime;

    }
    
    function stationsDistance(from, to){
        // scaled because everything is scaled at the beginning
        var distance = Math.sqrt((from.lon - to.lon)**2+(from.lat - to.lat)**2)
        return distance;
}
    
    function setTrainsPositions(unixSeconds, train){
        /*
        Find positions based on schedule and based on observations.
        TODO: take into account if real stops or not for timing.
        */
        
        // SCHEDULED
        // Find which is last passed station
        for (var i = 0; i < train.stops.length - 1; i++) {
            if (train.stops[i + 1].scheduledTime > unixSeconds) {break;}
        }
        var sfrom = train.stops[i];
        var sto = train.stops[i + 1];
        var sacceptedEdge, sratio, spos, sfromStop, stoStop;
        
        if (sfrom && sto){
            sfromStop = sfrom.stop;
            stoStop=sto.stop;
            // Check if real edge of precise graph
            sacceptedEdge = global.preciseGraph.isEdge(sfromStop.stop_id, stoStop.stop_id);
            // Find ratio
            sratio = (unixSeconds - sfrom.scheduledTime) / (sto.scheduledTime - sfrom.scheduledTime);
            // Compute position object given: from, to and ratio
            spos = placeWithOffset(sfromStop, stoStop, sratio);
            
        }
        
        var scheduled = {
            from: sfromStop,
            to: stoStop,
            timeRatio: sratio,
            pos: spos,
            acceptedEdge: sacceptedEdge
        };
        
        // OBSERVED (with extrapolation when no data is found)
        for (var j = 0; j < train.stops.length - 1; j++) {
            if (train.stops[j + 1].estimatedTime > unixSeconds) {break;}
        }
        
        var efrom = train.stops[j];
        var eto = train.stops[j + 1];
        var eacceptedEdge, eratio, epos, previousEstimatedDelay, nextEstimatedDelay, estimatedDelayEvolution, estimatedDelay, efromStop, etoStop;
        
        if (efrom && eto){
            // Check if real edge of precise graph
            eacceptedEdge = global.preciseGraph.isEdge(efrom.stop.stop_id, eto.stop.stop_id);    
            // Find ratio
            eratio = (unixSeconds - efrom.estimatedTime) / (eto.estimatedTime - efrom.estimatedTime);
            // compute position object given: from, to and ratio
            epos = placeWithOffset(efrom.stop, eto.stop, eratio);
            
            previousEstimatedDelay = efrom.estimatedDelay;
            nextEstimatedDelay = eto.estimatedDelay;
            
            estimatedDelayEvolution = nextEstimatedDelay - previousEstimatedDelay;
            estimatedDelay = eratio*nextEstimatedDelay + (1-eratio)*previousEstimatedDelay;
            
            efromStop = efrom.stop;
            etoStop = eto.stop;
        }

        var observed = {
            from: efromStop,
            to: etoStop,
            timeRatio: eratio,
            pos: epos,
            acceptedEdge: eacceptedEdge,
            previousEstimatedDelay: previousEstimatedDelay,
            nextEstimatedDelay: nextEstimatedDelay,
            estimatedDelayEvolution: estimatedDelayEvolution,
            estimatedDelay: estimatedDelay
        };
        
        train.atTime = {
            renderedAtTime: unixSeconds,
            scheduled: scheduled,
            observed : observed
        };
        return train;
    }
        
    function placeWithOffset(from, to, ratio) {
        
        // extrapolate position from trip ratio, previous station, and next station
        var fromPos = {lon: from.lon, lat: from.lat};
        var toPos = {lon: to.lon, lat: to.lat};
        
        var midpoint = d3.interpolate([fromPos.lon, fromPos.lat], [toPos.lon,toPos.lat])(ratio);
        var angle = Math.atan2(toPos.lat - fromPos.lat, toPos.lon - fromPos.lon) + Math.PI / 2;
        return [midpoint[0] + Math.cos(angle) * global.mapGlyphTrainCircleRadius, midpoint[1] + Math.sin(angle) * global.mapGlyphTrainCircleRadius ];
    }
    
    // PATH VIZ
    // STATIONS OBSERVED DELAYS 
    function stationWeightedLastDelays(stopId, direction, lastNSeconds){
        // Not yet implemented, for now random
        return Math.random()*30;
    }
    
    // SCALING FUNCTION
    function setScale(stations, h, w, hborder, wborder){
        // Set scales for GPS coordinates placed on SVG object
        var x = d3.scale.linear()
            .domain(d3.extent(stations, function(station){return station.lon;}))
            .range([wborder, w-wborder]);
        global.xScale = x;

        var y = d3.scale.linear()
            .domain(d3.extent(stations, function(station){return station.lat;}))
            // inverted range because of coordinates inverted
            .range([(h-hborder),hborder]);
        global.yScale = y;
    }
    
    // HOVER HIGHLIGHT FUNCTIONS
    /*
    For trains: 
    - one tooltip, text, position and opacity according to hovered train
    */
    function toolTipInit(){
        // Define the div for the tooltip
        global.toolTip = d3.select("body").append("div")	
            .attr("class", "tooltip")				
            .style("opacity", 0);
    }
    
    function selectTrain(d) {
        global.selectedTrip = d;
    }
    
    function hoverTrain(d) {
        // set hoveredTrip: only one at a time
        global.hoveredTrip = d.trip;
        
        // update tooltip
        global.toolTip
            .style("left", (d3.event.pageX + 8) + "px")		
            .style("top", (d3.event.pageY - 28) + "px")
            .transition()		
            .duration(200)		
            .style("opacity", .7)
            .text("Train "+d.trip+" currently going from station " + 
                  d.atTime.observed.from.name+" to station "+ d.atTime.observed.to.name + 
                  ", has an estimated delay of "+d.atTime.observed.estimatedDelay+" seconds."
                 );
        }
    
    function unHoverTrain() {
        // set hovered trip as null
        global.hoveredTrip = null;
        // update tootlip
        global.toolTip.transition()		
            .duration(500)		
            .style("opacity", 0);	
    }
    
    function highlightTrain(d) {
        if (d === null) {
            highlightedTrip = null;
        } else {
            highlightedTrip = d.trip;
        }
        highlight();
        d3.event.stopPropagation();
      }

    /*
    For stations:
    - Global variables to know  or station is hovered.
    */
    function hoverStation(d) {
        global.hoveredStation = d.stop_id;
        // make name visible
        d3.select("#"+d.stop_id.slice(10))
            .classed('hover', true );
    }
    
    function unHoverStation(d) {
        // make name invisible
        d3.select("#"+d.stop_id.slice(10)+".station-name")
            .classed('hover', false );
        global.hoveredStation = null;
    }
    
    // INFO PANEL
    function infoPanel(){
        $( "#nbNotYetTrains" ).text(global.notYet.length);
        $( "#nbActiveTrains" ).text(global.active.length);
        $( "#nbFinishedTrains" ).text(global.finished.length);
        $( "#nbDisplayError" ).text(global.active.length - global.positionedTrains.length);
    }
    
    // COLOR
    global.delayMapColorScale =  d3.scale.linear()
            .interpolate(d3.interpolateLab)
            .domain([-300, 60, 600])
            .range(['rgb(0, 104, 55)', 'rgb(255, 255, 255)', 'rgb(165, 0, 38)']);
    
    function initLegendTrains(){
        //Append a defs (for definition) element to your SVG
        var defs = global.svg.append("defs");

        //Append a linearGradient element to the defs and give it a unique id
        var linearGradient = defs.append("linearGradient")
            .attr("id", "linear-gradient");
        
        //Horizontal gradient
        linearGradient
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "100%")
            .attr("y2", "0%");
        
         //Append multiple color stops by using D3's data/enter step
        linearGradient.selectAll("stop") 
            .data( global.delayMapColorScale.range() )                  
            .enter().append("stop")
            .attr("offset", function(d,i) { return i/(global.delayMapColorScale.range().length-1); })
            .attr("stop-color", function(d) { return d; });
        
        //Draw the rectangle and fill with gradient
        global.svg.append("rect")
            .attr("width", 80)
            .attr("height", 20)
            .style("fill", "url(#linear-gradient)");
    }
   
    // SLIDER AND TIMER FUNCTIONS
    function renderTimeSlider(min, max) {
        $( "#slider" ).slider({
            step: 2,
        orientation:"horizontal",
          animate: "slow",
          value: min+18000,
          min: min,
          max: max,
          slide: function( event, ui ) {
            $( "#slider-text" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));
            $( "#slider-title" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));

            renderAllAtTime(ui.value, true);
            global.renderingTimeStamp = ui.value;
            global.lastTime = ui.value;
          },
          change: function( event, ui ) {
            $( "#slider-text" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));
            $( "#slider-title" ).text(moment(ui.value*1000).format("MMMM Do YYYY, h:mm:ss a"));
            
            renderAllAtTime(ui.value);
            global.renderingTimeStamp = ui.value;
            global.lastTime = ui.value;
            }
        });
    } 
    
    function sliderTimerUpdate(){
        // set value
        // previous time
        var previous = $("#slider").slider("option", "value");
        
        $("#slider").slider('value', previous+global.timerAdd);
        if (global.timerActivated){
            setTimeout(sliderTimerUpdate, global.timerDelay);
        }
    }
    
    function setButtonInitialState(){
        // Timer button
        $("#button").on("click", function(){
            global.timerActivated = !global.timerActivated;
            sliderTimerUpdate();
            if (global.timerActivated){$("#button").text("Stop");}
            else { $("#button").text("Start"); }
        });
        // Scheduled button
        $("#scheduled").closest('label').on("click", function(){
            console.log("Display Schedule");
            global.displayScheduled = 1; 
            global.displayObserved = 0; 

        });
        // Observed button
        $("#observed").closest('label').on("click", function(){
            console.log("Display Observed");
            global.displayObserved = 1; 
            global.displayScheduled = 0; 

        });
    }
    
    function renderSpeedSlider() {
        $( "#speed" ).slider({
            orientation:"horizontal",
            animate: "slow",
            value: global.timeSpeed,
            min: 0,
            max: 500,
            slide: function( event, ui ) {
            $( "#speed-value" ).text(ui.value);
            global.timeSpeed = ui.value;
            recomputeTiming();
          }
        });
    }
    
    function renderTimerDelaySlider() {
        $( "#timer-delay" ).slider({
            orientation:"horizontal",
            animate: "slow",
            value: global.timerDelay,
            min: 15,
            max: 150,
            slide: function( event, ui ) {
            $( "#timer-delay-value" ).text(ui.value);
            global.timerDelay = ui.value;
            recomputeTiming();
          }
        });
    } 
    
    function recomputeTiming(){
        global.timerAdd = global.timerDelay*global.timeSpeed/1000; // will add n seconds at each iteration
        // Transition time (shouldn't be much bigger than timerDelay)
        global.transitionTime = global.timerDelay * global.smoothness;
    }
    
    // SPECIFIC GRAPHS
    // AFFLUENCE ON SECTION
    
    function computeActiveTrainsPerTime(){
        /* returns in following format: array of:
        {
            date: timestamp,
            total: NbOfActiveTrains,
            meanDelay: meanDelay
        }
        
        */
        global.activeTrainsData = [];
        for (var unixSeconds=global.minUnixSeconds; unixSeconds<global.maxUnixSeconds; unixSeconds+=600){
            
            var active = global.trips.filter(isActiveObserved.bind(this,unixSeconds));
            
            active.map(setTrainsPositions.bind(this, unixSeconds))
                .filter(function(train){
                if (!train){return; }
            });

            var meanDelay = _.reduce(active.map(function(trip){return trip.atTime.observed.estimatedDelay;}), function(memo, num){ return memo + num; }, 0)/active.length;
            
            global.activeTrainsData.push({
                date: unixSeconds*1000,
                total: active.length,
                meanDelay: meanDelay
            });
        }
    }
    
    // TROUBLESHOOTING FUNCTIONS
    global.tripsWithPassedStations = function (){
        // for troubleshooting, returns list of trips with identified passing stations
        return global.trips.filter(function(trip){
            // among all stops
            return trip.stops.find(function(stop){
                // has a non undefined nextPath attribute
                if (!stop.nextPath){return;}
                if (stop.nextPath.length>0){return true;}
            });
        });
        
    }
    
    global.tripsWithPrecisePathError = function (){
        // for troubleshooting, returns list of trips with identified passing stations
        var tripsWithErrors = global.trips.filter(function(trip){
            // that among all stops
            var lastStopId = trip.stops[trip.stops.length-1].stop_id;
            var hasStopError = trip.stops.find(function(stop){
                // have a non undefined nextPath attribute (while being a true stop)
                // except last stop that never has nextPath
                
                return ((!stop.nextPath)&&(stop.realStop)&&(stop.stop_id!==lastStopId));
            });
            return hasStopError;
        });
        return tripsWithErrors;
    }
    
    global.activeTripsWithoutPosAtTime = function(){
        // to know which trains haven't been displayed because of errors
        return global.active
            .filter(function(trip){
                if (!global.positionedTrains.includes(trip)){return true;}
        });
    }
    
    global.stopIdToStop = function(stopId){
        // Only used for parsing/preprocessing or debugging.
        var stop = global.stations.find(function(stop){return stop.stop_id === stopId;});
        if (!stop){    
            // adds stop_id to errors stops, and associate it with trip_id
            if (global.errors.notFoundStops[stopId] === undefined) {
                global.errors.notFoundStops[stopId] = [];
                console.log("Added "+stopId+" to stop_ids without found station.")
            }
        }
        return stop;
    };
    
    // MATH FUNCTION
    
    function cumulativeSum(arr) {
        var builder = function (acc, n) {
            var lastNum = acc.length > 0 ? acc[acc.length-1] : 0;
            acc.push(lastNum + n);
            return acc;
        };
        return _.reduce(arr, builder, []);
    }
    
    global.sum = function(arr){
        return _.reduce(arr, function(memo, num){ return memo + num; }, 0);
    };
    
    global.mean = function(arr){
        var sum = global.sum(arr);
        return sum / arr.length;
    };
    
    global.weightedMean = function (arrVals, arrWeights){
        var weightedValues = arrVals.map(function(val, i){return val*arrWeights[i];});
        var sum = global.sum(weightedValues);
        var sumWeights = global.sum(arrWeights);
        return sum / sumWeights;
    };
    
    // LEGEND FUNCTION
    
    // Utility for creating a color scale gradient
    // After calling VIZ.createColorScaleGradient(scale, 'my-scale')
    // Can use it to fill a rectangle:
    // rect.attr('fill', 'url(#my-scale)')
    function createColorScaleGradient(scale, name) {
        var gradient = d3.select('body')
            .appendOnce('svg', 'svgdefs')
            .attr('width', 0)
            .attr('height', 0)
            .appendOnce("defs", 'defs')
            .appendOnce('linearGradient', name).firstTime
                .attr("id", name)
                .attr("x1", "0%")
                .attr("y1", "0%")
                .attr("x2", "100%")
                .attr("y2", "0%")
                .attr("spreadMethod", "pad");

        var valueToPercentScale = d3.scale.linear()
            .domain(d3.extent(scale.domain()))
            .range(["0%", "100%"]);

        gradient.selectAll('stop')
            .data(scale.domain())
            .enter()
          .append("svg:stop")
            .attr("offset", valueToPercentScale)
            .attr("stop-color", scale)
            .attr("stop-opacity", 1);
    }
    
    function initLegendTrains(){
        //Append a defs (for definition) element to your SVG
        var defs = global.svg.append("defs");

        //Append a linearGradient element to the defs and give it a unique id
        var linearGradient = defs.append("linearGradient")
            .attr("id", "linear-gradient");
        
        //Horizontal gradient
        linearGradient
            .attr("x1", "0%")
            .attr("y1", "0%")
            .attr("x2", "100%")
            .attr("y2", "0%");
        
         //Append multiple color stops by using D3's data/enter step
        linearGradient.selectAll("stop") 
            .data( global.delayMapColorScale.range() )                  
            .enter().append("stop")
            .attr("offset", function(d,i) { return i/(global.delayMapColorScale.range().length-1); })
            .attr("stop-color", function(d) { return d; });
        
        //Draw the rectangle and fill with gradient
        global.svg.append("rect")
            .attr("width", 80)
            .attr("height", 20)
            .style("fill", "url(#linear-gradient)");
    }
    
    // EXPRESSIONS HERE: before only function statements
    global.requiresData(['json!data/clean_data/stations.json','json!data/clean_data/h_sections.json', 'json!data/clean_data/trains.json'], true)
        .done(function(stations, sections, trips){
        
        //// PARAMETERS
        // Canvas parameters
        var hborder=25, wborder=80;
        var w = 500+2*wborder, h = 500+2*hborder;
        // Chosen line
        global.line="H";
        // Size of trains: to compute distance from path
        global.mapGlyphTrainCircleRadius = 4.0;
        
        // Timer
        global.smoothness = 0.7;
        global.timeSpeed = 150; // time real time x N
        global.timerDelay = 50; // new update every n milliseconds
        global.timerAdd = global.timerDelay*global.timeSpeed/1000; // will add n seconds at each iteration
        // Transition time (shouldn't be much bigger than timerDelay)
        global.transitionTime = global.timerDelay * global.smoothness;
        
        // Subsections cache for computing delay evolutions
        global.subsectionsMaxCachedElements = 8;
        // max taken into account is 20 mins
        global.maxFreshness = 1200;
        // Subsection width (scaled afterwards)
        global.subsectionWidth = 40;
        
        //// INIT
        
        global.visibleStations = [{id: "StopPoint:DUA8727600"}, {id: "StopPoint:DUA8727103"}, {id: "StopPoint:DUA8727613", reverse:true}, {id:"StopPoint:DUA8727657"}];
        
        // Init map svg
        global.svg = d3.select("#map")
            .append("svg")
            .attr("width", w)
            .attr("height", h)
            .classed("center-block", true);
        
        // init cache results
        global.cache = {};
        global.cache.stationsDistances = [];
        global.errors = {};
        global.errors.notFoundStops = {};
        global.errors.stopNoCoords = [];
        global.errors.stopNoNeighboor = [];
        
        // Highlight and hover init
        global.highlightedTrip = null;
        global.hoveredTrip = null;
        
        // Scheduled or observed
        global.displayScheduled = 0;
        global.displayObserved = 1;
        
        // Functions init
        global.isActiveObserved = isActiveObserved;
        global.isActiveScheduled = isActiveScheduled;
        
        // Generates initial table
        global.initDatatable();
        
        //// DATA IMPORT, PARSING, SCALING OF STATIONS
        // Stations are imported before because their coordinates are used for scaling, and then used to compute
        // sections coordinates.
        var parsedStations = stations.map(parseStation).filter(function(station){if (station){return station}});
        // Compute svg scale given stations positions
        setScale(parsedStations, h, w, hborder, wborder)
        // Rescale coordinates of all stations
        global.stations = parsedStations.map(function(station){
            station.lon = global.xScale(station.lon); 
            station.lat = global.yScale(station.lat); 
            return station;
        });
        
        //// DATA IMPORT, PARSING OF SECTIONS AND TRIPS
        // Sections
        global.sections = sections.map(parseSection);
        // Graph preprocessing (to then find trains shortest paths between stations)
        networkPreprocessing();
        
        // Trains
        var parsedTrips = trips.map(parseTrip).filter(function(trip){if (trip){return trip}});
        global.trips = parsedTrips;
        // Find train shortest paths and estimate time with delay
        global.trips.forEach(preprocessTrainPathWithTime);
        
        // Finding trains range of dates
        global.minUnixSeconds = d3.min(d3.values(trips), function (d) { return d.begin; });
        global.maxUnixSeconds = d3.max(d3.values(trips), function (d) { return d.end; });
    
        
        // RENDERING SLIDERS AND TIMERS
        // Timer button
        setButtonInitialState();
        // Lasttime init
        global.lastTime = global.minUnixSeconds;
        // Slider init
        renderTimeSlider(global.minUnixSeconds, global.maxUnixSeconds);
        // Speed slider
        renderSpeedSlider();
        // TimerDelay slider
        renderTimerDelaySlider();

        
        // CHART - ACTIVE TRAINS
        // Computes data along whole day
        computeActiveTrainsPerTime();
        
        // Generates chart
        global.generateActiveTrainsChart();
        
        
        //// DRAWING STATIONS AND SECTIONS
        // Sections
        
        drawSections(global.sections);

        // Tooltip hover over Map of trains and stations
        toolTipInit();
        
        // Draw subsection jams
        global.drawInitialSubsectionsJam();
        drawStationsNames(global.stations);

        // Draw stations
        drawStations(global.stations);
            //
        // initLegendTrains();
        
        // Init train focus
        global.initTrainFocus();
        
    
    });
    }(window.H));