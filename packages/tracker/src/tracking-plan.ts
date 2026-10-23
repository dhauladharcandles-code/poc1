/**
 * The tracking plan: every event the POC emits, why it exists and which question it answers.
 * Event names follow Segment's "Object Action" convention so they map 1:1 to Segment Protocols.
 *
 * `question` ties each event to one of the product questions:
 *   what   – what the agent is doing
 *   how    – how they are doing it (path, method, tools)
 *   why    – what problem they are solving
 *   time   – how long it takes / where time goes
 *   pain   – what friction they hit
 *   usage  – which features are used, and how much
 */
export type Question = 'what' | 'how' | 'why' | 'time' | 'pain' | 'usage';

export interface PlannedEvent {
  name: string;
  source: 'auto' | 'app';
  questions: Question[];
  description: string;
  props: string[];
}

export const EVENTS = {
  // ── Context ──────────────────────────────────────────────────────────────
  PageViewed: { name: 'Page Viewed', source: 'auto', questions: ['what', 'how'], description: 'Segment page() call. One per route view, includes load type (navigate/reload/back_forward).', props: ['page_type', 'load_type', 'referrer_host'] },
  AgentIdentified: { name: 'Agent Identified', source: 'auto', questions: ['what'], description: 'Segment identify() with agent traits (team, tenure).', props: ['agent_id', 'team', 'tenure_months'] },
  InvestigationStarted: { name: 'Investigation Started', source: 'auto', questions: ['why', 'how', 'time'], description: 'First view of an order by an agent in a 30-minute activity window. The unit of analysis.', props: ['order_id', 'order_status', 'entry_point', 'ticket_id', 'ticket_reason', 'referrer_host'] },

  // ── Attention & time ─────────────────────────────────────────────────────
  PageLeft: { name: 'Page Left', source: 'auto', questions: ['time', 'how', 'pain'], description: 'Agent switched tab (hidden) or another window took focus (blur, debounced 1s).', props: ['leave_type', 'last_action', 'last_element_id', 'ms_since_last_action', 'last_copy_field', 'ms_since_last_copy'] },
  PageReturned: { name: 'Page Returned', source: 'auto', questions: ['time', 'how'], description: 'Agent came back. away_ms tells how long they were elsewhere (carrier site, helpdesk, chat…).', props: ['away_type', 'away_ms', 'left_after_copy', 'last_copy_field'] },
  AgentIdle: { name: 'Agent Idle', source: 'auto', questions: ['time', 'pain'], description: 'No input for 60s while the page is visible (reading, on a call, or stuck).', props: ['idle_threshold_ms'] },
  AgentActive: { name: 'Agent Active', source: 'auto', questions: ['time'], description: 'Input resumed after idle.', props: ['idle_ms'] },
  EngagementRecorded: { name: 'Engagement Time Recorded', source: 'auto', questions: ['time'], description: 'Heartbeat with deltas: engaged (visible+focused+not idle), visible, hidden, blurred and idle ms, plus scroll stats.', props: ['engaged_ms', 'visible_ms', 'hidden_ms', 'blurred_ms', 'idle_ms', 'scroll_max_pct', 'scroll_reversals', 'scroll_distance_px', 'flush_reason'] },

  // ── Viewability, scroll, hover ───────────────────────────────────────────
  ElementViewed: { name: 'Element Viewed', source: 'auto', questions: ['what', 'usage'], description: 'A tracked element was ≥50% in view (or filled half the viewport) for ≥1s. Once per element per page view.', props: ['element_id', 'element_key', 'section', 'time_to_view_ms'] },
  ElementExposure: { name: 'Element Exposure Recorded', source: 'auto', questions: ['what', 'time', 'usage'], description: 'Batched dwell per element since the last flush: ms in view, max visible ratio, ms hovered.', props: ['elements[]', 'flush_reason'] },
  ElementHovered: { name: 'Element Hovered', source: 'auto', questions: ['what', 'pain'], description: 'Hover intent (≥800ms) on elements marked data-track-hover, e.g. the ETA explanation.', props: ['element_id', 'element_key', 'hover_ms'] },
  ScrollDepthReached: { name: 'Scroll Depth Reached', source: 'auto', questions: ['what', 'usage'], description: 'Page or container (events panel) reached 25/50/75/90/100%.', props: ['container', 'depth_pct', 'time_to_reach_ms'] },

  // ── Clicks & heatmaps ────────────────────────────────────────────────────
  ElementClicked: { name: 'Element Clicked', source: 'auto', questions: ['what', 'how', 'usage'], description: 'Every click, anchored to the nearest data-track-id element with relative x/y — the raw material for click heatmaps.', props: ['element_id', 'element_key', 'section', 'x_rel', 'y_rel', 'page_x', 'page_y', 'viewport_w', 'viewport_h', 'is_interactive', 'target_tag', 'target_text'] },
  RageClick: { name: 'Rage Click Detected', source: 'auto', questions: ['pain'], description: '≥3 clicks within 800ms in a 32px radius.', props: ['element_id', 'click_count', 'is_interactive'] },
  DeadClick: { name: 'Dead Click Detected', source: 'auto', questions: ['pain'], description: 'Click with no DOM change, navigation or selection within 700ms. kind=non_interactive means the agent expected something clickable.', props: ['element_id', 'kind', 'cursor', 'target_text'] },

  // ── Clipboard & keyboard ─────────────────────────────────────────────────
  ContentCopied: { name: 'Content Copied', source: 'auto', questions: ['what', 'how', 'why'], description: 'Copy/cut via keyboard, context menu or a copy button. Never sends the text: field, detected type, length and a hash only.', props: ['field', 'element_id', 'method', 'detected_type', 'text_length', 'is_full_field', 'contains_pii', 'text_hash'] },
  ContentPasted: { name: 'Content Pasted', source: 'auto', questions: ['how', 'why'], description: 'Paste into an input (e.g. an order id pasted from the helpdesk into search).', props: ['field', 'detected_type', 'text_length'] },
  TextSelected: { name: 'Text Selected', source: 'auto', questions: ['what'], description: 'Agent highlighted text (≥3 chars) without copying — reading aloud, comparing.', props: ['field', 'element_id', 'detected_type', 'text_length'] },
  FindInPageUsed: { name: 'Find In Page Used', source: 'auto', questions: ['pain', 'how'], description: 'Ctrl/Cmd+F — the agent could not find something by scanning.', props: ['scroll_pct'] },
  PagePrinted: { name: 'Page Printed', source: 'auto', questions: ['how'], description: 'Print dialog opened.', props: [] },

  // ── Errors ───────────────────────────────────────────────────────────────
  ErrorEncountered: { name: 'Error Encountered', source: 'auto', questions: ['pain'], description: 'JS error, unhandled promise rejection or app-reported failure.', props: ['kind', 'message', 'source'] },
  EmptyStateShown: { name: 'Empty State Shown', source: 'app', questions: ['pain', 'usage'], description: 'A "nothing here" state was rendered (no tracking scans yet, no events for a filter…).', props: ['element_id', 'reason'] },

  // ── Order detail features ────────────────────────────────────────────────
  OrderSearched: { name: 'Order Searched', source: 'app', questions: ['how'], description: 'Search on the order queue.', props: ['query_type', 'query_length', 'result_count'] },
  OrderOpened: { name: 'Order Opened', source: 'app', questions: ['how'], description: 'Order clicked from the queue.', props: ['order_id', 'position', 'from_search'] },
  TimelineStepClicked: { name: 'Timeline Step Clicked', source: 'app', questions: ['what', 'usage'], description: 'Order timeline milestone clicked (opens the events panel filtered to that stage).', props: ['milestone', 'milestone_state'] },
  OrderTotalsExpanded: { name: 'Order Totals Expanded', source: 'app', questions: ['what', 'why', 'usage'], description: 'Price breakdown opened (billing questions).', props: [] },
  LineItemExpanded: { name: 'Line Item Expanded', source: 'app', questions: ['what', 'usage'], description: 'Line item details opened.', props: ['line_item_id', 'product_type', 'shipment_status'] },
  ArtworkPreviewOpened: { name: 'Artwork Preview Opened', source: 'app', questions: ['what', 'why', 'usage'], description: 'Artwork enlarged.', props: ['line_item_id', 'artwork_status', 'artwork_dpi'] },
  ArtworkZoomed: { name: 'Artwork Zoomed', source: 'app', questions: ['what', 'why'], description: 'Zoom level changed inside the artwork preview.', props: ['line_item_id', 'zoom'] },
  TrackingLinkClicked: { name: 'Tracking Link Clicked', source: 'app', questions: ['what', 'why', 'pain'], description: 'Outbound click to the carrier site — our own tracking info was not enough.', props: ['line_item_id', 'carrier', 'shipment_status'] },
  EventsPanelOpened: { name: 'Events Panel Opened', source: 'app', questions: ['what', 'usage'], description: 'Order events panel opened, and from where.', props: ['trigger', 'line_item_id', 'filter'] },
  EventsPanelClosed: { name: 'Events Panel Closed', source: 'app', questions: ['time', 'usage'], description: 'Panel closed with time open and how much was seen.', props: ['open_ms', 'rows_viewed', 'max_scroll_pct', 'close_method'] },
  EventsFilterChanged: { name: 'Events Filter Changed', source: 'app', questions: ['how', 'usage', 'pain'], description: 'Category tab switched in the events panel. Rapid switching = hunting.', props: ['from', 'to', 'result_count'] },
  EventRowExpanded: { name: 'Event Row Expanded', source: 'app', questions: ['what'], description: 'An event row in the panel was expanded for detail.', props: ['event_id', 'category', 'severity', 'age_hours'] },
  AgentSwitched: { name: 'Agent Switched', source: 'app', questions: ['what'], description: 'Demo-only: agent picker changed.', props: ['agent_id'] },
} as const satisfies Record<string, PlannedEvent>;

export type EventKey = keyof typeof EVENTS;
export type EventName = (typeof EVENTS)[EventKey]['name'];

export const EVENT_NAMES: EventName[] = Object.values(EVENTS).map((e) => e.name);
