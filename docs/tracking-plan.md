# Tracking plan

<!-- Generated from packages/tracker/src/tracking-plan.ts — edit that file, then run: pnpm --filter @poc/tracker plan:md -->

Every event carries these **common properties** (so any row joins back to a session, browser tab, page view, replay and order):
`session_id`, `tab_id`, `page_view_id`, `replay_id`, `zone`, `page_type`, `investigation_id`, `order_id`, `ticket_id`, `entry_point`, `app_version`, `seq`.
The agent is the Segment `userId` (from `identify`), with `team` and `tenure_months` as traits.

**Answers** maps each event to the product questions: *What* the agent is doing, *How* they do it, *Why* (what problem they're solving),
*Time* spent, *Pain* (friction) and feature *Usage*.

| Event | Source | Answers | Why it exists | Key properties |
|---|---|---|---|---|
| **Page Viewed** | automatic | What, How | Segment page() call. One per route view, includes load type (navigate/reload/back_forward). | `page_type`, `load_type`, `referrer_host` |
| **Agent Identified** | automatic | What | Segment identify() with agent traits (team, tenure). | `agent_id`, `team`, `tenure_months` |
| **Investigation Started** | automatic | Why, How, Time | First view of an order by an agent in a 30-minute activity window. The unit of analysis. | `order_id`, `order_status`, `entry_point`, `ticket_id`, `ticket_reason`, `referrer_host` |
| **Page Left** | automatic | Time, How, Pain | Agent switched tab (hidden) or another window took focus (blur, debounced 1s). | `leave_type`, `last_action`, `last_element_id`, `ms_since_last_action`, `last_copy_field`, `ms_since_last_copy` |
| **Page Returned** | automatic | Time, How | Agent came back. away_ms tells how long they were elsewhere (carrier site, helpdesk, chat…). | `away_type`, `away_ms`, `left_after_copy`, `last_copy_field` |
| **Agent Idle** | automatic | Time, Pain | No input for 60s while the page is visible (reading, on a call, or stuck). | `idle_threshold_ms` |
| **Agent Active** | automatic | Time | Input resumed after idle. | `idle_ms` |
| **Engagement Time Recorded** | automatic | Time | Heartbeat with deltas: engaged (visible+focused+not idle), visible, hidden, blurred and idle ms, plus scroll stats. | `engaged_ms`, `visible_ms`, `hidden_ms`, `blurred_ms`, `idle_ms`, `scroll_max_pct`, `scroll_reversals`, `scroll_distance_px`, `flush_reason` |
| **Element Viewed** | automatic | What, Usage | A tracked element was ≥50% in view (or filled half the viewport) for ≥1s. Once per element per page view. | `element_id`, `element_key`, `section`, `time_to_view_ms` |
| **Element Exposure Recorded** | automatic | What, Time, Usage | Batched dwell per element since the last flush: ms in view, max visible ratio, ms hovered. | `elements[]`, `flush_reason` |
| **Element Hovered** | automatic | What, Pain | Hover intent (≥800ms) on elements marked data-track-hover, e.g. the ETA explanation. | `element_id`, `element_key`, `hover_ms` |
| **Scroll Depth Reached** | automatic | What, Usage | Page or container (events panel) reached 25/50/75/90/100%. | `container`, `depth_pct`, `time_to_reach_ms` |
| **Element Clicked** | automatic | What, How, Usage | Every click, anchored to the nearest data-track-id element with relative x/y — the raw material for click heatmaps. | `element_id`, `element_key`, `section`, `x_rel`, `y_rel`, `page_x`, `page_y`, `viewport_w`, `viewport_h`, `is_interactive`, `target_tag`, `target_text` |
| **Rage Click Detected** | automatic | Pain | ≥3 clicks within 800ms in a 32px radius. | `element_id`, `click_count`, `is_interactive` |
| **Dead Click Detected** | automatic | Pain | Click with no DOM change, navigation or selection within 700ms. kind=non_interactive means the agent expected something clickable. | `element_id`, `kind`, `cursor`, `target_text` |
| **Content Copied** | automatic | What, How, Why | Copy/cut via keyboard, context menu or a copy button. Never sends the text: field, detected type, length and a hash only. | `field`, `element_id`, `method`, `detected_type`, `text_length`, `is_full_field`, `contains_pii`, `text_hash` |
| **Content Pasted** | automatic | How, Why | Paste into an input (e.g. an order id pasted from the helpdesk into search). | `field`, `detected_type`, `text_length` |
| **Text Selected** | automatic | What | Agent highlighted text (≥3 chars) without copying — reading aloud, comparing. | `field`, `element_id`, `detected_type`, `text_length` |
| **Find In Page Used** | automatic | Pain, How | Ctrl/Cmd+F — the agent could not find something by scanning. | `scroll_pct` |
| **Page Printed** | automatic | How | Print dialog opened. | — |
| **Error Encountered** | automatic | Pain | JS error, unhandled promise rejection or app-reported failure. | `kind`, `message`, `source` |
| **Empty State Shown** | app code | Pain, Usage | A "nothing here" state was rendered (no tracking scans yet, no events for a filter…). | `element_id`, `reason` |
| **Order Searched** | app code | How | Search on the order queue. | `query_type`, `query_length`, `result_count` |
| **Order Opened** | app code | How | Order clicked from the queue. | `order_id`, `position`, `from_search` |
| **Timeline Step Clicked** | app code | What, Usage | Order timeline milestone clicked (opens the events panel filtered to that stage). | `milestone`, `milestone_state` |
| **Order Totals Expanded** | app code | What, Why, Usage | Price breakdown opened (billing questions). | — |
| **Line Item Expanded** | app code | What, Usage | Line item details opened. | `line_item_id`, `product_type`, `shipment_status` |
| **Artwork Preview Opened** | app code | What, Why, Usage | Artwork enlarged. | `line_item_id`, `artwork_status`, `artwork_dpi` |
| **Artwork Zoomed** | app code | What, Why | Zoom level changed inside the artwork preview. | `line_item_id`, `zoom` |
| **Tracking Link Clicked** | app code | What, Why, Pain | Outbound click to the carrier site — our own tracking info was not enough. | `line_item_id`, `carrier`, `shipment_status` |
| **Events Panel Opened** | app code | What, Usage | Order events panel opened, and from where. | `trigger`, `line_item_id`, `filter` |
| **Events Panel Closed** | app code | Time, Usage | Panel closed with time open and how much was seen. | `open_ms`, `rows_viewed`, `max_scroll_pct`, `close_method` |
| **Events Filter Changed** | app code | How, Usage, Pain | Category tab switched in the events panel. Rapid switching = hunting. | `from`, `to`, `result_count` |
| **Event Row Expanded** | app code | What | An event row in the panel was expanded for detail. | `event_id`, `category`, `severity`, `age_hours` |
| **Agent Switched** | app code | What | Demo-only: agent picker changed. | `agent_id` |

## DOM conventions

Automatic events need no code — micro frontends opt in with attributes:

| Attribute | Meaning |
|---|---|
| `data-track-id="line_item.eta"` | Stable, type-level id. Used for aggregation and to anchor heatmap clicks. |
| `data-track-key="li_10482_1"` | Instance key (which line item / event row). |
| `data-track-section="line_items"` | Page section for scroll maps. |
| `data-track-field="tracking_number"` | Semantic field name for copy/select analytics. |
| `data-track-hover` | Emit `Element Hovered` after 800ms hover intent. |
| `data-track-scroll="events_panel"` | Scroll container whose depth is measured. |
| `data-track-view-event="off"` | Count in exposure summaries only (no per-element `Element Viewed`), for long lists. |
| `data-pii` | Masked in session replay; copied text classified only as `pii`. |
| `data-track-ignore` | Tracker and replay ignore this subtree. |
