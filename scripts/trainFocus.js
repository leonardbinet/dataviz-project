
(function(global){
    
    function capitalizeFirstLetter(string) {
        string = string.toLocaleLowerCase();
        return string.charAt(0).toUpperCase() + string.slice(1);
    }
    
    
    function setLabelHeader(data){
        
        tripId = data.trip
        
       global.labelContainer = global.svgContainer
            .selectAll("text.tripId")
            .data([tripId], function(d,i){return d});

        
        // Set text train id and line:
        
        // no update
        
        //enter
        global.labelContainer.enter()
                .append("text")
                 .classed("tripId","true")
                 .attr("x", global.xLine + 10)
                 .attr("y", 20)
                 .text(function(d){return "Train ID : " + d.slice(0,8)+"...";})
                 .attr("font-family", "sans-serif")
                 .attr("font-size", "17px")
                 .attr("fill", "black");

        //exit
        global.labelContainer.exit().remove();
        
        
    }


    function drawMainLine(xLine, yLine, wLine, lineColor){
        var mainLine = global.svgContainer.selectAll("line.main").data(["main-line"], function(d){return d;})
        
        // update
        mainLine
             .attr("x1", xLine)
             .attr("y1", xLine)
             .attr("x2", xLine)
             .attr("y2", yLine)
             .attr("stroke-width", wLine)
             .attr("stroke", lineColor)         
        
        // enter
        mainLine.enter()
            .append("line")
                .classed("main", true)
                .attr("x1", xLine)
                .attr("y1", xLine)
                .attr("x2", xLine)
                .attr("y2", yLine)
                .attr("stroke-width", wLine)
                .attr("stroke", lineColor)     
        // exit
        mainLine.exit().remove()
        
    }
    
    function drawImageLogo(data){
        var image = global.svgContainer.selectAll("image")
                        .data([data.line],function(d,i){
                            return d+i;
                        })

        //update
        image.selectAll("image")
                    .attr("xlink:href",function(d){
                        return "images/lines/" + d + ".png"
                    });

        image.enter().append("svg:image")
           .attr('x', 25)
           .attr('y', 0)
           .attr('width', 30)
           .attr('height', 30)
           .attr("xlink:href",function(d){
                                return "images/lines/" + d + ".png"
                            })

        // remove
        image.exit().remove();

    }
    
    function computePositionTrain(numStations,yLine,xLine,data){
        var stops_array = data.stops
        var stations_with_coordinates = {}
        
        for (i = 0; i < numStations; i++) {
            var y = xLine + (yLine - xLine)/(numStations - 1) * i + 5
            var name_station = stops_array[i].stop.name
            stations_with_coordinates[name_station] = y
        }

        window.stations_with_coordinates = stations_with_coordinates

        var from_postition = data.atTime.observed.from.name
        var to_position = data.atTime.observed.to.name

        var ratio_position = data.atTime.observed.timeRatio
        window.ratio_position = ratio_position

        var actual_position = (stations_with_coordinates[to_position] - stations_with_coordinates[from_postition]) * ratio_position + stations_with_coordinates[from_postition]

        return actual_position
    }
    
    global.initTrainFocus = function(){
            // BEGIN EXECUTION
    
            // PARAMS
            var timeparam = 1000;
            var easeparam = "linear";
            global.dictionary_color = 
                {
                    H: "#7B4339",
                    J: "#CDCD00",
                    K: "#C7B300",
                    L: "#7584BC",
                    N: "#00A092",
                    P: "#F0B600",
                    R: "#E4B4D1",
                    U: "#D60058",
                    A: "#D1302F",
                    B: "#427DBD",
                    C: "#FCD946",
                    D: "#5E9620",
                    E: "#BD76A1",
                    T4: "#F2AF00"
                };

            global.wLine = 8;
            global.xLine = 50;

            // INIT
            global.svgContainer = d3.select("#trip-zoom")
                .append("svg")
                    .attr("display","block")
                    .attr("float","left");

    };
    
    global.updateTrainFocus = function (data){
        
        if (!data){return}

        // Init update
        var numStations = data.stops.length;
        var stations_with_coordinates = {}
        var w = 30 * (numStations + 1) + 100;
        var h = 30 * (numStations + 1) + 100;
        // Time to complete one transition / iteration of the circular or elliptical path
        var yLine = 35 * (numStations + 1);
        var lineColor = global.dictionary_color[data.line]

        // Setting svgContainer Attributes
        global.svgContainer
            .attr("width", w)
            .attr("height", h);

        var trip_array = [data.trip];
        
        function computeCY(d,i){
            if(i == 0){return global.xLine + (yLine - global.xLine)/(numStations - 1) * i;}    
            else {return global.xLine + (yLine - global.xLine)}
        }

        function computeYLine(d,i){
            return global.xLine + (yLine - global.xLine)/(numStations - 1) * (i + 1)
        }

        function computeYText(d,i){
            return global.xLine + (yLine - global.xLine)/(numStations - 1) * i + 5
        }
        
        function toTitleCase(str)
        {
            return str.replace(/\w\S*/g, function(txt){return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();});
        }

        // Set label header
        setLabelHeader(data);
        
        // Draw the image logo
        drawImageLogo(data);

        //Draw the line
        drawMainLine(global.xLine, yLine, global.wLine, lineColor);

        // Draw stations
        
        
        global.stationContainer = global.svgContainer.selectAll("g.station-container")
                .data(data.stops, function(d,i){return String(i) + d.stop.stop_id});

        // UPDATE
        
        global.stationContainer.selectAll("circle.station-circle")
            .filter(function(d,i){if(i==0 || i == numStations - 1) return d+i})
            .attr("cx", global.xLine)
            .attr("cy", computeCY)
            .attr("r", 10)
            .attr("id",function(d,i){return i})
            .style("fill", "white")
            .attr("stroke", lineColor)
            .attr("stroke-width", 9)
        
        global.stationContainer.selectAll("line.station-line")
            .attr("class","station-line")
            .filter(function(d,i){if(i > 0 && i < (numStations - 1)) return d+i})
            .attr("id",function(d,i){return i})
            .attr("x1", global.xLine)
            .attr("y1",computeYLine)
            .attr("x2", global.xLine + 16)
            .attr("y2",computeYLine)
            .attr("stroke-width", global.wLine - 3)
            .attr("stroke", lineColor);
        

        // ENTER
        var enteringStationContainers = global.stationContainer.enter()
            .append("g")
            .classed("station-container", true)

        enteringStationContainers.append("circle")
            .attr("class", "station-circle")
            .filter(function(d,i){if(i==0 || i == numStations - 1) return d+i})
            .attr("class",function(d,i){return "term-station-outer"})
            .attr("cx", global.xLine)
            .attr("cy", computeCY)
            .attr("r", 10)
            .attr("id",function(d,i){return i})
            .style("fill", "white")
            .attr("stroke", lineColor)
            .attr("stroke-width", 9)
        
        enteringStationContainers.append("line")
             .attr("class","station-line")
             .filter(function(d,i){if(i > 0 && i < (numStations - 1)) return d+i})
             .attr("id",function(d,i){return i})
             .attr("x1", global.xLine)
             .attr("y1",computeYLine)
             .attr("x2", global.xLine + 16)
             .attr("y2",computeYLine)
             .attr("stroke-width", global.wLine - 3)
             .attr("stroke",lineColor);
        
        enteringStationContainers.append("text")
             .attr("class", "station-text")
             .attr("x", global.xLine + 40)
             .attr("y", computeYText)
             .text(function(d,i){
                var name = toTitleCase(d.stop.name);
            
                if (name.length < 20){return name;}
                else {return (name.slice(0,18)+"...");}
            
                })
             .attr("font-family", "sans-serif")
             .attr("font-size", "18px")
             .attr("fill", "black");


        // EXIT
        global.stationContainer.exit().remove()
        
        //Computing the position
        trainPosition = computePositionTrain(numStations,yLine,global.xLine,data)
        
        trainPoint = global.svgContainer.selectAll(".actual-position")
                                .data([data], function(d,i){return d.trip;});

        //update
        trainPoint
              .attr("r", 10)
              .style("fill","#1E90FF")
              .attr("cx", global.xLine)
              .transition()
              .duration(300)
              .attr("cy", function(d,i){return trainPosition;})

        //enter
        var enteringActualPosition = trainPoint.enter()
        
        enteringActualPosition.append("circle")
             .attr("class","actual-position")
             .attr("r", 10)
             .style("fill","#1E90FF")
             .attr("cx", global.xLine)
             .attr("cy", function(d,i){return trainPosition;})
        
        trainPoint.exit().remove();
        
    }
    
}(window.H));
