"""
Preprocessing steps to get data in right format so that it can be displayed.

Data should end in the following format: list of:

begin                                           1494448500
end                                             1494458543
line                                                  "H"
stops  [{'stop_id': 'StopPoint:DUA8727613', 'time': 1391422380, 'observed_time': 1391422380}, ...
trip                            "DUASN847548F01001-1_408444"

"""

import pandas as pd
import matplotlib
matplotlib.use("TkAgg")
import matplotlib.pyplot as plt
import seaborn as sns

__SAVE_TO_JSON__ = False
__IMPORT_DATA_PATH__ = "raw_data/20170510.pickle"
__EXPORT_DATA_PATH__ = "clean_data/trains.json"
__LINE__ = "H"

df = pd.read_pickle(__IMPORT_DATA_PATH__)

# Subset selection: columns, and rows
cols_to_keep = [
    "StopTime_stop_sequence", "Trip_trip_id",
    "Stop_stop_id", "D_stop_scheduled_datetime",
    "D_trip_delay"
]
sel = df.query("Route_route_short_name==@__LINE__")\
    .loc[:, cols_to_keep]

sel["D_stop_scheduled_datetime"] = sel.D_stop_scheduled_datetime\
    .apply(lambda x: x.timestamp())

sel["D_trip_delay"] = sel.D_trip_delay.astype(float)

stops_matrix = pd.pivot_table(
    sel,
    index="Trip_trip_id",
    columns="Stop_stop_id",
    values=["D_stop_scheduled_datetime", "D_trip_delay"]
)
r_stops  = stops_matrix\
    .apply(lambda x: x.unstack().to_dict(), axis=1)\
    .apply(lambda x: [{
        "stop_id": k,
        "time": x[k]["D_stop_scheduled_datetime"],
        "delay": x[k]["D_trip_delay"]
    } for k in x if pd.notnull(x[k]["D_stop_scheduled_datetime"])])\
    .apply(lambda x: sorted(x, key=lambda y: y["time"]))

r_begin = stops_matrix.loc[:, "D_stop_scheduled_datetime"].min(axis=1)

r_end = stops_matrix.loc[:, "D_stop_scheduled_datetime"].max(axis=1)

r_trip = stops_matrix.index.to_series().to_frame()

r_line = pd.Series("H", index=stops_matrix.index).to_frame()

result = pd.concat(
    [r_begin, r_end, r_trip, r_line, r_stops],
    axis=1,
)
result.columns = ["begin", "end", "trip", "line", "stops"]


if __SAVE_TO_JSON__:
    result.to_json(__EXPORT_DATA_PATH__, orient="records")
