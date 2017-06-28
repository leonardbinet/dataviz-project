(function (global){
    
    global.Graph = function() {
        this.neighbors = {}; // Key = vertex, value = array of neighbors.
        this.cache = [];
    }
    
    global.Graph.prototype.addPathToCache = function (source, target, path) {
        /* This method is used to save previous found paths in following format:
        {
            source: "sourceStopId",
            target: "targetStopId",
            path: ["stop1","stop2"]  // or [] if none
        }
        
        It could be improved by commuting both stations
        */
        this.cache.push({
            source: source,
            target: target,
            path: path
        })
    };
    
    global.Graph.prototype.searchPathInCache = function (source, target) {
        /* This method is used to find previous found paths.
        Return undefined if not found.
        */
        var cachedResult;
        cachedResult = this.cache.find(function(d){
            return (d.source===source && d.target===target);
        });
        if (cachedResult){
            // console.log("Found in cache.")
            return cachedResult.path;
        }
    };

    global.Graph.prototype.addEdge = function (u, v) {

        if (this.neighbors[u] === undefined) {  // Add the edge u -> v.
            this.neighbors[u] = [];
        }
        this.neighbors[u].push(v);
        if (this.neighbors[v] === undefined) {  // Also add the edge v -> u in order
            this.neighbors[v] = [];               // to implement an undirected graph.
        }                                  // For a directed graph, delete
        this.neighbors[v].push(u);              // these four lines.
    };
        
    global.Graph.prototype.bfs = function(source) {
        var queue = [ { vertex: source, count: 0 } ],
        visited = { source: true },
        tail = 0;
        while (tail < queue.length) {
            var u = queue[tail].vertex,
            count = queue[tail++].count;  // Pop a vertex off the queue.
            this.neighbors[u].forEach(function (v) {
                if (!visited[v]) {
                    visited[v] = true;
                    queue.push({ vertex: v, count: count + 1 });
                }
            });
        }
    };

    global.Graph.prototype.shortestPath = function(source, target) {
        /* Find shortest path in graph.
        
        It will return an array of stops between source and target (source and target are not included.)
        */ 
        // first check in cached results
        
        var cachedPath = this.searchPathInCache(source, target);
        if (cachedPath){return cachedPath};
        
        if (source == target) {   // Delete these four lines if
            return [];                 // when the source is equal to
        }                         // the target.
        var queue = [ source ],
        visited = { source: true },
        predecessor = {},
        tail = 0;
        while (tail < queue.length) {
            var u = queue[tail++],  // Pop a vertex off the queue.
            neighbors = this.neighbors[u];
            if (!neighbors){
                console.log("No neighbor for stop "+u);
                if (!global.errors.stopNoNeighboor.find(function(d){return d===u;}))
                global.errors.stopNoNeighboor.push(u);
                return [];
            }
            for (var i = 0; i < neighbors.length; ++i) {
                var v = neighbors[i];
                if (visited[v]) {
                    continue;
                }
                visited[v] = true;
                if (v === target) {   // Check if the path is complete.
                    var path = [ v ];   // If so, backtrack through the path.
                    while (u !== source) {
                        path.push(u);
                        u = predecessor[u];
                    }
                    path.push(u);
                    path.reverse();
                    // remove source and target (last is excluded)
                    path = path.slice(1,path.length-1);
                    this.addPathToCache(source, target, path);
                    return path;
                    }
                predecessor[v] = u;
                queue.push(v);
            }
        }
        return [];
    };
    
    global.Graph.prototype.isEdge = function(source, target) {
        return (_.contains(this.neighbors[source],target));
    };
    
    // My custom sections
    global.SectionManager = function(){
        this.sections = global.sections;
    };
    
    global.SectionManager.prototype.refreshAtTime = function(unixSeconds){
        var self = this;
        // First flush previous dir0/1 arrays, and set renderedAtTime
        this.sections.forEach(function(section){section.subsections.forEach(function(subsection){
            // refresh all but cache
            subsection.atTime.renderedAtTime= unixSeconds;
            subsection.atTime.observed.dir0 = [];
            subsection.atTime.observed.dir1 = [];
            subsection.atTime.scheduled.dir0 = [];
            subsection.atTime.scheduled.dir1 = [];
        })})
        // Then add currently active trains
        
        // SCHEDULED
        global.positionedTrains
            .filter(function (d) {return global.isActiveScheduled(unixSeconds, d) ;})
            .forEach(function(train){
            var from = train.atTime.scheduled.from;
            var to = train.atTime.scheduled.to;
            self.addTrainToSubsection(from, to, train, "scheduled");
        });
        
        // OBSERVED
        global.positionedTrains
            .filter(function (d) {return global.isActiveObserved(unixSeconds, d) ;})
            .forEach(function(train){
            var from = train.atTime.observed.from;
            var to = train.atTime.observed.to;
            self.addTrainToSubsection(from, to, train, "observed");
        });
        
        
        // OBSERVED POSTPROCESSING: cache managing
        // if time goes backward erase cache
        if (unixSeconds < global.lastTime){
            this.sections.forEach(function(section){section.subsections.forEach(function(subsection){
                subsection.atTime.observed.cachedDir0= [];
                subsection.atTime.observed.cachedDir1= [];
            })});
        }
        
        
    };
    
    global.SectionManager.prototype.addTrainToSubsection = function(from, to, train, type, avoidCache){
        // type is either observed or scheduled
        var answered = this.sections.find(function(section){
            // Find if on subsections dir0
            var dir0SubSection = section.subsections.find(
                function(subsection){
                    return ((from === subsection.from)&&(to === subsection.to));
            });
            // Find if on subsections dir1
            var dir1SubSection = section.subsections.find(
                function(subsection){
                    return ((to === subsection.from)&&(from === subsection.to));
            });
            // It can only be one
            if (dir0SubSection && dir1SubSection){
                console.log("Error trying to assign train to subsection: for given section, two matching subsections");
                return false;
            }
            // If none stop
            if (!dir0SubSection && !dir1SubSection){return false;}
            
            var matchingSubsection, direction, cachedDir;
            if (dir0SubSection){
                matchingSubsection = dir0SubSection;
                direction = "dir0";
                cachedDir = "cachedDir0"            
            }
            else {
                matchingSubsection = dir1SubSection;
                direction = "dir1";
                cachedDir = "cachedDir1"            
            }
            
            // Current
            var currentTrainsContainer = matchingSubsection.atTime[type][direction];
            currentTrainsContainer.push(train);
                
            // Cache
            
            if (avoidCache){return true;}
            
            var cachedTrainsContainer = matchingSubsection.atTime[type][cachedDir];
            
            var cache = {
                lastObservedTimeOnSubsection: global.lastTime,
                train: train,
                delayEvolutionOnSubsection: train.atTime.observed.estimatedDelayEvolution
            }

            // check if train already on cache, if yes, remove previous before adding this one
            var alreadyCachedTrain = cachedTrainsContainer.find(function(cached){return cached.train.trip===train.trip;});
            if (alreadyCachedTrain){
                var index = cachedTrainsContainer.indexOf(alreadyCachedTrain);
                cachedTrainsContainer.splice(index, 1);
            }
            cachedTrainsContainer.push(cache);

            // finally, how many do we want to keep? defined at begining of script
            if (cachedTrainsContainer.length > global.subsectionsMaxCachedElements){
                cachedTrainsContainer = cachedTrainsContainer.slice(cachedTrainsContainer.length-global.subsectionsMaxCachedElements);
            }

            return true;
        });
    }
}(window.H))

