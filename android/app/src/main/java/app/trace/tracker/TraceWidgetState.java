package app.trace.tracker;

import androidx.annotation.Nullable;
import org.json.JSONException;
import org.json.JSONObject;

final class TraceWidgetState {
    final boolean checkInAvailable;
    final String routineName;
    final String checkInState;

    private TraceWidgetState(boolean checkInAvailable, String routineName, String checkInState) {
        this.checkInAvailable = checkInAvailable;
        this.routineName = routineName;
        this.checkInState = checkInState;
    }

    @Nullable
    static TraceWidgetState fromJson(@Nullable String value) {
        if (value == null) return null;
        try {
            JSONObject json = new JSONObject(value);
            if (json.optInt("schemaVersion") != 1) return null;
            String state = json.optString("checkInState", "");
            if (!state.equals("not_started") && !state.equals("draft") && !state.equals("completed")) return null;
            return new TraceWidgetState(
                json.optBoolean("checkInAvailable", false),
                json.optString("routineName", "Daily Check-In"),
                state
            );
        } catch (JSONException ignored) {
            return null;
        }
    }

    String statusText() {
        if (!checkInAvailable) return "Set up your daily routine";
        if (checkInState.equals("completed")) return "Today complete";
        if (checkInState.equals("draft")) return "In progress";
        return "Not completed";
    }
}
