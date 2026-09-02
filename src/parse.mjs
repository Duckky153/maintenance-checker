import { load } from "cheerio";
import {
  canonicalLocation,
  collapseWhitespace,
  extractExtendedDate,
  extractLocations,
  parseUtcSchedule,
  uniqueBy,
} from "./utils.mjs";

const STATUS_BASE = "https://status.coreweave.com";

function fullUrl(value = "") {
  if (value.startsWith("http")) return value;
  return `${STATUS_BASE}${value.startsWith("/") ? value : `/${value}`}`;
}

function textFromHtml(value = "") {
  const $ = load(`<div id="root">${value}</div>`);
  $("br").replaceWith("\n");
  return $("#root").text().replace(/\u00a0/g, " ").replace(/[ \t]+\n/g, "\n").trim();
}

function parseRssUpdates(descriptionHtml) {
  const updates = [];
  const pattern = /<small>([\s\S]*?)<\/small>\s*<br\s*\/?>\s*<b>([\s\S]*?)<\/b>\s*-\s*([\s\S]*?)(?=<br\s*\/?>\s*<br\s*\/?>\s*<small>|$)/gi;
  for (const match of descriptionHtml.matchAll(pattern)) {
    updates.push({
      atText: textFromHtml(match[1]),
      status: collapseWhitespace(textFromHtml(match[2])),
      body: collapseWhitespace(textFromHtml(match[3])),
      source: "rss",
    });
  }
  return updates;
}

function idFrom(value = "") {
  return value.split("/").filter(Boolean).at(-1) ?? value;
}

export function parseRss(xml) {
  const $ = load(xml, { xmlMode: true });
  const events = [];
  $("item").each((_, element) => {
    const node = $(element);
    const title = collapseWhitespace(node.find("title").text());
    const link = collapseWhitespace(node.find("link").text());
    const descriptionHtml = node.find("description").text();
    const updates = parseRssUpdates(descriptionHtml);
    const description = updates[0]?.body ?? collapseWhitespace(textFromHtml(descriptionHtml));
    const titleLocations = extractLocations(title);
    const bodyLocations = extractLocations(description);
    const kind = link.includes("/maintenance/") ? "maintenance" : "incident";
    events.push({
      id: collapseWhitespace(node.find("guid").text()) || idFrom(link),
      kind,
      title,
      sourceUrl: link,
      postedAt: collapseWhitespace(node.find("pubDate").text()),
      description,
      status: updates.at(-1)?.status ?? "Unknown",
      phase: updates.at(-1)?.status?.toLowerCase() === "completed" ? "history" : "recent",
      component: null,
      scheduleText: null,
      startAt: null,
      endAt: null,
      titleLocation: titleLocations[0] ?? null,
      fieldLocation: bodyLocations[0] ?? null,
      updates,
      sourceKinds: ["rss"],
    });
  });
  return events;
}

function fieldRows($, node, kind) {
  const fields = {};
  node.find(".panel-body").first().children(".row").each((_, rowElement) => {
    const row = $(rowElement);
    const label = collapseWhitespace(row.find(".event_inner_title").first().text()).replace(/\s+$/, "");
    if (!label) return;
    let value = "";
    if (/description/i.test(label)) {
      value = row.find(`.${kind}_section`).first().text();
    } else {
      value = row.find(`.${kind}_section`).first().text();
    }
    fields[label.toLowerCase()] = collapseWhitespace(value);
  });
  return fields;
}

function pageUpdates($, node) {
  const updates = [];
  node.find(".incident_time").each((_, timeElement) => {
    const row = $(timeElement).closest(".row");
    const status = collapseWhitespace(row.find(".incident_update_status").text()).replace(/^[•\s]+/, "");
    const body = collapseWhitespace(row.find(".incident_message_details").text());
    if (!body && !status) return;
    updates.push({
      atText: collapseWhitespace($(timeElement).text()),
      status: status || "Update",
      body,
      source: "status-page",
    });
  });
  return updates;
}

function phaseFor($, node, kind) {
  const ancestorId = node.parents("[id]").map((_, parent) => $(parent).attr("id")).get().join(" ");
  if (ancestorId.includes(`${kind}_active`)) return "active";
  if (ancestorId.includes(`${kind}_scheduled`)) return "upcoming";
  if (ancestorId.includes("main_history")) return "history";
  return "current";
}

export function parseStatusPage(html) {
  const $ = load(html);
  const events = new Map();

  for (const kind of ["maintenance", "incident"]) {
    const selector = kind === "maintenance"
      ? '.maintenance[id], [id^="statusio_maintenance_scheduled_"]'
      : '.incident[id]';
    $(selector).each((_, element) => {
      const node = $(element);
      const linkNode = node.find('.panel-title h5 a[href*="/pages/"]').first();
      const href = linkNode.attr("href");
      if (!href) return;
      const id = idFrom(href);
      const title = collapseWhitespace(linkNode.text());
      const fields = fieldRows($, node, kind);
      const scheduleText = fields.schedule || null;
      const schedule = parseUtcSchedule(scheduleText ?? "");
      const updates = pageUpdates($, node);
      const titleLocation = extractLocations(title)[0] ?? null;
      const fieldLocation = extractLocations(fields.locations || fields.location || "")[0] ?? null;
      const headerStatus = collapseWhitespace(
        node.find(`.${kind}_status_description, .status_description`).first().text(),
      );
      const status = kind === "incident"
        ? updates.at(-1)?.status || headerStatus || "Unknown"
        : headerStatus || updates.at(-1)?.status || "Unknown";
      const phase = phaseFor($, node, kind);
      const event = {
        id,
        kind,
        title,
        sourceUrl: fullUrl(href),
        postedAt: null,
        description: fields.description || "",
        status,
        phase,
        component: fields.components || null,
        scheduleText,
        ...schedule,
        titleLocation,
        fieldLocation,
        updates,
        sourceKinds: ["status-page"],
      };

      const previous = events.get(id);
      const phaseRank = { active: 4, upcoming: 3, current: 2, history: 1 };
      if (!previous || phaseRank[event.phase] > phaseRank[previous.phase]) {
        events.set(id, event);
      }
    });
  }

  return [...events.values()];
}

export function mergeEvents(pageEvents, rssEvents) {
  const merged = new Map(pageEvents.map((event) => [event.id, event]));
  for (const rssEvent of rssEvents) {
    const pageEvent = merged.get(rssEvent.id);
    if (!pageEvent) {
      merged.set(rssEvent.id, rssEvent);
      continue;
    }
    const updates = rssEvent.updates.length
      ? uniqueBy(rssEvent.updates, (update) => `${update.atText}|${update.status.toLowerCase()}|${update.body.toLowerCase()}`)
      : pageEvent.updates;
    merged.set(rssEvent.id, {
      ...pageEvent,
      postedAt: rssEvent.postedAt,
      description: pageEvent.description || rssEvent.description,
      fieldLocation: pageEvent.fieldLocation || rssEvent.fieldLocation,
      status: rssEvent.status && rssEvent.status !== "Unknown" ? rssEvent.status : pageEvent.status,
      updates,
      sourceKinds: ["status-page", "rss"],
    });
  }

  return [...merged.values()].map((event) => {
    const extensionText = [event.description, ...event.updates.map((update) => update.body)].join(" ");
    return {
      ...event,
      titleLocation: event.titleLocation ? canonicalLocation(event.titleLocation) : null,
      fieldLocation: event.fieldLocation ? canonicalLocation(event.fieldLocation) : null,
      extendedThroughDate: extractExtendedDate(extensionText),
    };
  });
}
