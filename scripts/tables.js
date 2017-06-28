(function(global){
    
    global.initDatatable = function(){
        global.datatable = $('#active-trains-table').DataTable( {
            columns: [
                { title: "Train number", data: "trip", width: "20%" },
                { title: "Estimated Delay (secs)" , data: "estimatedDelay", width: "10%"},
                { title: "From station", data: "from", width: "20%"},
                { title: "To station", data: "to" , width: "20%"},
                { title: "On subsection", data: "subsection"}
            ]
        } );
    };
    
    global.updateTableData = function(data){
        global.datatable.clear();
        global.datatable.rows.add(data);
        global.datatable.draw();
        
    };
}(window.H))