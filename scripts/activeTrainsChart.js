(function(global){
    
    global.generateActiveTrainsChart = function(){
        global.ActiveTrainsChart = c3.generate({
            bindto: '#stacked-area-chart-active-trains',
            data: {
                json: global.activeTrainsData,

                keys: {
                    value: ["total", "meanDelay"],
                    x:"date",
                    xFormat: '%Y-%m-%d %H:%M:%S'
                },
                axes: {
                    activeTrain: "y",
                    meanDelay: "y2"
                },
                names: {
                    total: 'Number of train rolling',
                    meanDelay: 'Mean observed delay',
                }
            },
            
            axis: {
                x: {
                    type: 'timeseries',
                    tick: {
                        format: '%HH:%MM',
                        outer: false,
                        count: 25                    
                    }
                },
                y: {
                    padding: 0,
                    min: 0
                },
                y2: {
                    show: true,
                    min: 0,
                    padding: 0
                }
                
            }
            
        });   
    }
}(window.H))