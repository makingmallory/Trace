package app.trace.tracker;

import android.appwidget.AppWidgetManager;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import androidx.annotation.NonNull;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "TraceWidget")
public class TraceWidgetPlugin extends Plugin {
    static final String PREFERENCES = "trace_widget_snapshot";
    static final String SNAPSHOT_KEY = "snapshot";

    @PluginMethod
    public void update(@NonNull PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null || TraceWidgetState.fromJson(snapshot) == null) {
            call.reject("A valid Trace widget snapshot is required.");
            return;
        }
        Context context = getContext().getApplicationContext();
        context.getSharedPreferences(PREFERENCES, Context.MODE_PRIVATE)
            .edit().putString(SNAPSHOT_KEY, snapshot).apply();
        Intent refresh = new Intent(context, TraceWidgetProvider.class)
            .setAction(AppWidgetManager.ACTION_APPWIDGET_UPDATE);
        int[] ids = AppWidgetManager.getInstance(context)
            .getAppWidgetIds(new ComponentName(context, TraceWidgetProvider.class));
        refresh.putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids);
        context.sendBroadcast(refresh);
        call.resolve(new JSObject());
    }
}
