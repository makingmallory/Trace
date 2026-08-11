package app.trace.tracker;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

public class TraceWidgetProvider extends AppWidgetProvider {
    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] appWidgetIds) {
        String value = context.getSharedPreferences(TraceWidgetPlugin.PREFERENCES, Context.MODE_PRIVATE)
            .getString(TraceWidgetPlugin.SNAPSHOT_KEY, null);
        TraceWidgetState state = TraceWidgetState.fromJson(value);
        for (int id : appWidgetIds) manager.updateAppWidget(id, viewsFor(context, state));
    }

    private RemoteViews viewsFor(Context context, TraceWidgetState state) {
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.trace_widget);
        boolean available = state != null && state.checkInAvailable;
        views.setTextViewText(R.id.widget_status, state == null ? "Open Trace to get started" : state.statusText());
        views.setTextViewText(R.id.widget_check_in, available
            ? (state.checkInState.equals("draft") ? "Resume" : state.checkInState.equals("completed") ? "Review" : "Check in")
            : "Set up");
        views.setOnClickPendingIntent(R.id.widget_header, launch(context, "trace://home", 100));
        views.setOnClickPendingIntent(R.id.widget_check_in,
            launch(context, available ? "trace://check-in" : "trace://settings/nightly-check-in", 101));
        views.setOnClickPendingIntent(R.id.widget_log, launch(context, "trace://events", 102));
        return views;
    }

    private PendingIntent launch(Context context, String uri, int requestCode) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri), context, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(context, requestCode, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
}
