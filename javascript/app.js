const APP = {
  data: null,
  state: {
    category: null,
    position: null,
    scoreSet: 1,
    setFilter: "",
    selectedLinks: {},
  },
};

const CAT_COLORS = {
  Service: "#FF8C00",
  Reception: "#20B2AA",
  Passe: "#8B00FF",
  Attaque: "#FFFF00",
  Block: "#8B4513",
  Defense: "#00FFFF",
};

const CATEGORY_LABELS = {
  Service: "Service",
  Reception: "Réception",
  Passe: "Passe",
  Attaque: "Attaque",
  Block: "Block",
  Defense: "Défense",
};

const OWN = { 4: [120, 260], 3: [260, 260], 2: [400, 260], 5: [120, 360], 6: [260, 360], 1: [400, 360] };
const OPP = { 2: [120, 120], 3: [260, 120], 4: [400, 120], 1: [120, 190], 6: [260, 190], 5: [400, 190] };

window.addEventListener("DOMContentLoaded", init);

async function init() {
  const response = await fetch("./data.json");
  APP.data = await response.json();
  if (!APP.data?.events?.length) {
    document.getElementById("kpiGrid").innerHTML = "<p>Impossible de charger les données.</p>";
    return;
  }
  normalizeReceptions(APP.data.events);
  bindScoreSetControl();
  bindSetFilterControl();
  render();
}

function render() {
  syncScoreSetSelect();
  syncSetFilterSelect();
  const filtered = getFilteredEvents();
  renderSummary(filtered);
  renderKpis(filtered);
  renderCourt(filtered);
  renderSunburst(filtered);
  renderDetail(filtered);
  renderServiceSequenceSankey(filtered);
  renderScoreboard(filtered);
}

function getFilteredEvents() {
  let events = APP.data.events.filter((event) => event.origin_side === "own");

  if (APP.state.position) {
    const [side, pos] = APP.state.position;
    events = events.filter((event) => {
      return (event.origin === pos && event.origin_side === side) || (event.destination === pos && event.dest_side === side);
    });
  }

  if (APP.state.setFilter) {
    events = events.filter((event) => parseSetFromRally(event.rally) === APP.state.setFilter);
  }

  if (APP.state.category) {
    events = events.filter((event) => event.category === APP.state.category);
  }

  if (APP.state.subcategory) {
    events = events.filter((event) => (event.subcategory || "Non précisé") === APP.state.subcategory);
  }

  return events;
}

function renderSummary(events) {
  const summary = document.getElementById("filtersSummary");
  const activeFilters = [];
  if (APP.state.position) {
    const [side, pos] = APP.state.position;
    activeFilters.push(`poste <strong>${pos}</strong> (${side === "own" ? "nous" : "adverse"})`);
  }
  if (APP.state.setFilter) {
    activeFilters.push(`set <strong>${APP.state.setFilter}</strong>`);
  }
  if (APP.state.category) {
    activeFilters.push(`catégorie <strong>${CATEGORY_LABELS[APP.state.category] || APP.state.category}</strong>`);
  }
  if (APP.state.subcategory) {
    activeFilters.push(`sous-catégorie <strong>${APP.state.subcategory}</strong>`);
  }
  if (APP.state.outcome) {
    activeFilters.push(`issue <strong>${APP.state.outcome}</strong>`);
  }

  const { rallyCount } = getVisibleRallyStats(events);
  summary.innerHTML = activeFilters.length
    ? `Vue filtrée — ${activeFilters.join(" · ")} → <strong>${events.length}</strong> événement(s) sur <strong>${rallyCount}</strong> rallye(s)`
    : `Vue unique — <strong>${events.length}</strong> événements de notre équipe sur <strong>${rallyCount}</strong> rallye(s)`;
}

function renderKpis(events) {
  const grid = document.getElementById("kpiGrid");
  const { rallyCount, pointCount } = getVisibleRallyStats(events);
  const actionSuccesses = events.filter((event) => event.result === "ok" && ["Attaque", "Service", "Block"].includes(event.category)).length;
  const service = events.filter((event) => event.category === "Service");
  const reception = events.filter((event) => event.category === "Reception");
  const attaque = events.filter((event) => event.category === "Attaque");
  const defense = events.filter((event) => event.category === "Defense");

  const pct = (group) => {
    if (!group.length) return "—";
    const ok = group.filter((event) => event.result === "ok").length;
    return `${Math.round((ok / group.length) * 100)}%`;
  };

  const cards = [
    { label: "Événements", value: events.length, hint: "Événements affichés dans la vue" },
    { label: "Rallyes", value: rallyCount, hint: "Rallyes uniques couverts par ces événements" },
    { label: "Points marqués", value: pointCount, hint: "Points gagnés par notre équipe" },
    { label: "Actions réussies", value: actionSuccesses, hint: "Services, attaques et blocks réussis" },
    { label: "% service", value: pct(service), hint: "Services réussis" },
    { label: "% réception", value: pct(reception), hint: "Réceptions réussies" },
    { label: "% attaque", value: pct(attaque), hint: "Attaques réussies" },
    { label: "% défense", value: pct(defense), hint: "Défenses réussies" },
  ];

  grid.innerHTML = cards.map(cardMarkup).join("");
}

function cardMarkup(card) {
  return `
    <div class="kpi-card">
      <div class="label">${card.label}</div>
      <div class="value">${card.value}</div>
      <div class="hint">${card.hint}</div>
    </div>
  `;
}

function renderCourt(events) {
  const container = document.getElementById("courtContainer");
  container.innerHTML = "";
  const svg = createSvgElement("svg", { viewBox: "0 0 520 460", width: "100%", height: "460" });

  drawCourtBase(svg);
  drawPositions(svg, events);
  const palette = getRoutePalette(events);
  drawRoutes(svg, events, palette);
  container.appendChild(svg);
}

function getRoutePalette(events) {
  if (!APP.state.category) return {};
  const subKeys = [...new Set(events
    .filter((event) => event.category === APP.state.category)
    .map((event) => event.subcategory || "Non précisé"))].sort();
  return buildSubcategoryPalette(subKeys, CAT_COLORS[APP.state.category]);
}

function drawCourtBase(svg) {
  const court = createSvgElement("rect", { x: 40, y: 70, width: 440, height: 340, rx: 14, fill: "#f8fbff", stroke: "#b9c9da", "stroke-width": 2 });
  const centerLine = createSvgElement("line", { x1: 260, y1: 70, x2: 260, y2: 410, stroke: "#c4d8e8", "stroke-width": 2 });
  const topZone = createSvgElement("rect", { x: 40, y: 70, width: 440, height: 170, fill: "none", stroke: "#dce8f3", "stroke-width": 1 });
  const bottomZone = createSvgElement("rect", { x: 40, y: 240, width: 440, height: 170, fill: "none", stroke: "#dce8f3", "stroke-width": 1 });
  const labelTop = createSvgElement("text", { x: 260, y: 50, "text-anchor": "middle", fill: "#64748b", "font-size": 14 }, "Terrain adverse");
  const labelBottom = createSvgElement("text", { x: 260, y: 438, "text-anchor": "middle", fill: "#64748b", "font-size": 14 }, "Notre terrain");
  svg.append(court, centerLine, topZone, bottomZone, labelTop, labelBottom);
}

function drawPositions(svg, events) {
  const volume = {};
  events.forEach((event) => {
    volume[[event.origin_side, event.origin].join("-")] = (volume[[event.origin_side, event.origin].join("-")] || 0) + 1;
    volume[[event.dest_side, event.destination].join("-")] = (volume[[event.dest_side, event.destination].join("-")] || 0) + 1;
  });

  const maxVol = Math.max(1, ...Object.values(volume));
  const allPositions = [
    ...Object.entries(OWN).map(([pos, coords]) => ({ side: "own", pos: Number(pos), coords })),
    ...Object.entries(OPP).map(([pos, coords]) => ({ side: "opponent", pos: Number(pos), coords })),
  ];

  allPositions.forEach(({ side, pos, coords }) => {
    const isSelected = APP.state.position && APP.state.position[0] === side && APP.state.position[1] === pos;
    const dimmed = APP.state.position && !isSelected;
    const radius = 14 + Math.sqrt((volume[[side, pos].join("-")] || 0) / maxVol) * 10;
    const circle = createSvgElement("circle", {
      cx: coords[0],
      cy: coords[1],
      r: radius,
      fill: side === "own" ? "#e9f2fb" : "#f6f2e8",
      stroke: isSelected ? "#185FA5" : side === "own" ? "#6ca9e8" : "#b8b29d",
      "stroke-width": isSelected ? 3 : 1.6,
      opacity: dimmed ? 0.38 : 1,
      cursor: "pointer",
    });
    const label = createSvgElement("text", { x: coords[0], y: coords[1] + 5, "text-anchor": "middle", fill: "#14213d", "font-size": 13, "font-weight": 700 }, String(pos));
    circle.addEventListener("click", () => togglePosition(side, pos));
    label.addEventListener("click", () => togglePosition(side, pos));
    svg.append(circle, label);
  });
}

function drawRoutes(svg, events, palette = {}) {
  const grouped = {};
  events.forEach((event) => {
    const key = [event.category, event.subcategory || "Non précisé", event.origin, event.origin_side, event.destination, event.dest_side].join("::");
    grouped[key] = (grouped[key] || 0) + 1;
  });

  const entries = Object.entries(grouped);
  if (!entries.length) return;
  const maxCount = Math.max(...entries.map(([, count]) => count));

  entries.forEach(([key, count]) => {
    const [category, subcategory, origin, originSide, destination, destSide] = key.split("::");
    const from = getCoords(originSide, Number(origin));
    const to = getCoords(destSide, Number(destination));
    const strokeWidth = 1.6 + Math.sqrt(count / maxCount) * 4.2;
    const color = palette[subcategory] || CAT_COLORS[category] || "#185FA5";
    drawRoute(svg, from, to, color, strokeWidth);
  });
}

function drawRoute(svg, from, to, color, width) {
  const curve = (from[0] + to[0]) / 2;
  const path = createSvgElement("path", {
    d: `M ${from[0]} ${from[1]} C ${curve} ${from[1] - 30}, ${curve} ${to[1] + 30}, ${to[0]} ${to[1]}`,
    fill: "none",
    stroke: color,
    "stroke-width": width,
    "stroke-linecap": "round",
    opacity: 0.86,
  });
  svg.append(path);
}

function createSvgElement(tag, attrs = {}, text = "") {
  const element = document.createElementNS("http://www.w3.org/2000/svg", tag);
  Object.entries(attrs).forEach(([key, value]) => element.setAttribute(key, value));
  if (text) element.textContent = text;
  return element;
}

function getCoords(side, pos) {
  return side === "own" ? OWN[pos] : OPP[pos];
}

function togglePosition(side, pos) {
  const current = APP.state.position;
  APP.state.position = current && current[0] === side && current[1] === pos ? null : [side, pos];
  render();
}

function renderSunburst(events) {
  const chart = document.getElementById("sunburstChart");
  const rallyIds = [...new Set(events.map((event) => event.rally))];
  if (!rallyIds.length) {
    chart.innerHTML = '<div class="detail-item">Aucune donnée à afficher.</div>';
    return;
  }

  const ids = ["root"];
  const labels = ["Notre équipe"];
  const parents = [""];
  const values = [rallyIds.length];
  const colors = ["#E5E1D8"];
  const fullOutcomes = getRallyOutcomes(APP.data.events);

  if (!APP.state.category) {
    const byCat = {};
    events.forEach((event) => {
      byCat[event.category] = byCat[event.category] || new Set();
      byCat[event.category].add(event.rally);
    });
    Object.entries(byCat).forEach(([category, rallies]) => {
      const count = rallies.size;
      ids.push(`cat::${category}`);
      labels.push(CATEGORY_LABELS[category] || category);
      parents.push("root");
      values.push(count);
      colors.push(CAT_COLORS[category]);
    });
  } else {
    const focusEvents = events;
    const bySub = {};
    focusEvents.forEach((event) => {
      const sub = event.subcategory || "Non précisé";
      bySub[sub] = bySub[sub] || { rallies: new Set() };
      bySub[sub].rallies.add(event.rally);
    });

    const subKeys = Object.keys(bySub).sort();
    const palette = buildSubcategoryPalette(subKeys, CAT_COLORS[APP.state.category]);

    if (APP.state.subcategory) {
      const sub = APP.state.subcategory;
      const subRallyCount = bySub[sub] ? bySub[sub].rallies.size : 0;
      ids.push(`sub::${APP.state.category}::${sub}`);
      labels.push(sub);
      parents.push("root");
      values.push(subRallyCount);
      colors.push(palette[sub] || CAT_COLORS[APP.state.category]);

      const outcomeCounts = countOutcomeRallies(bySub[sub]?.rallies || [], fullOutcomes);
      Object.entries(outcomeCounts).forEach(([outcome, count]) => {
        ids.push(`out::${APP.state.category}::${sub}::${outcome}`);
        labels.push(outcome);
        parents.push(`sub::${APP.state.category}::${sub}`);
        values.push(count);
        colors.push(OUTCOME_COLORS[outcome]);
      });
    } else {
      subKeys.forEach((sub) => {
        const subRallyCount = bySub[sub].rallies.size;
        ids.push(`sub::${APP.state.category}::${sub}`);
        labels.push(sub);
        parents.push("root");
        values.push(subRallyCount);
        colors.push(palette[sub]);

        const outcomeCounts = countOutcomeRallies(bySub[sub].rallies, fullOutcomes);
        Object.entries(outcomeCounts).forEach(([outcome, count]) => {
          ids.push(`out::${APP.state.category}::${sub}::${outcome}`);
          labels.push(outcome);
          parents.push(`sub::${APP.state.category}::${sub}`);
          values.push(count);
          colors.push(OUTCOME_COLORS[outcome]);
        });
      });
    }
  }

  const trace = {
    type: "sunburst",
    ids,
    labels,
    parents,
    values,
    branchvalues: "total",
    hovertemplate: "<b>%{label}</b><br>%{value} rally(s)<extra></extra>",
    marker: { colors, line: { color: "white", width: 1 } },
  };

  Plotly.newPlot(chart, [trace], { margin: { l: 10, r: 10, t: 10, b: 10 }, height: 420, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" });
  chart.on("plotly_click", (data) => {
    const id = data?.points?.[0]?.id;
    if (!id) return;
    if (id === "root") {
      APP.state.category = null;
      APP.state.subcategory = null;
    } else if (id.startsWith("cat::")) {
      APP.state.category = id.split("::")[1];
      APP.state.subcategory = null;
    } else if (id.startsWith("sub::")) {
      const parts = id.split("::");
      APP.state.category = parts[1];
      APP.state.subcategory = parts[2];
    } else if (id.startsWith("out::")) {
      const parts = id.split("::");
      APP.state.category = parts[1];
      APP.state.subcategory = parts[2];
    }
    render();
  });
}

const OUTCOME_COLORS = {
  "Point gagné": "#5C8A2E",
  "Point perdu": "#C24B3F",
  "Suite": "#7D93A9",
};

function buildSubcategoryPalette(keys, baseColor) {
  const palette = {};
  const count = keys.length;
  keys.forEach((key, idx) => {
    const shift = count === 1 ? 0 : -25 + (50 * idx) / (count - 1);
    palette[key] = shadeColor(baseColor || "#185FA5", shift);
  });
  return palette;
}

function countOutcomeRallies(rallies, outcomeMap) {
  const counts = { "Point gagné": 0, "Point perdu": 0, Suite: 0 };
  rallies.forEach((rally) => {
    const result = outcomeMap[rally] || "Suite";
    counts[result] += 1;
  });
  return counts;
}

function getRallyOutcomes(events) {
  const byPoint = {};
  events.forEach((event) => {
    if (!event.point) return;
    byPoint[event.point] = byPoint[event.point] || [];
    byPoint[event.point].push(event);
  });

  const outcomeMap = {};
  Object.values(byPoint).forEach((pointEvents) => {
    const byRally = {};
    pointEvents.forEach((event) => {
      byRally[event.rally] = byRally[event.rally] || [];
      byRally[event.rally].push(event);
    });
    const rallyIds = Object.keys(byRally).sort((a, b) => Number(a.split("-R")[1]) - Number(b.split("-R")[1]));
    const lastRallyId = rallyIds[rallyIds.length - 1];
    const lastEvents = byRally[lastRallyId];
    const lastEvent = lastEvents[lastEvents.length - 1];
    let winner = "France";
    if (lastEvent.category === "Service" && lastEvent.result === "ko") {
      winner = lastEvent.origin_side === "own" ? "Paraguay" : "France";
    } else if (lastEvent.category === "Block") {
      winner = lastEvent.result === "ok" ? (lastEvent.origin_side === "own" ? "France" : "Paraguay") : (lastEvent.origin_side === "own" ? "Paraguay" : "France");
    } else if (lastEvent.category === "Attaque") {
      winner = lastEvent.result === "ok" ? (lastEvent.origin_side === "own" ? "France" : "Paraguay") : (lastEvent.origin_side === "own" ? "Paraguay" : "France");
    }
    rallyIds.forEach((rallyId, idx) => {
      outcomeMap[rallyId] = idx === rallyIds.length - 1 ? (winner === "France" ? "Point gagné" : "Point perdu") : "Suite";
    });
  });
  return outcomeMap;
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  return {
    r: (bigint >> 16) & 255,
    g: (bigint >> 8) & 255,
    b: bigint & 255,
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => value.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function shadeColor(hex, percent) {
  const { r, g, b } = hexToRgb(hex);
  const t = percent < 0 ? 0 : 255;
  const p = Math.abs(percent) / 100;
  const R = Math.round((t - r) * p + r);
  const G = Math.round((t - g) * p + g);
  const B = Math.round((t - b) * p + b);
  return rgbToHex(R, G, B);
}

function renderDetail(events) {
  const list = document.getElementById("detailList");
  const tableContainer = document.getElementById("detailTable");
  const blocks = events.filter((event) => event.category === "Block");
  list.innerHTML = "";

  if (blocks.length) {
    blocks.slice(0, 8).forEach((block) => {
      const item = document.createElement("div");
      item.className = "detail-item";
      item.innerHTML = `<span class="detail-strong">${block.player}</span> — bloc à ${block.blockers} (${block.blocker_pos}) — ${block.result === "ok" ? "Touche favorable" : "Raté"}`;
      list.appendChild(item);
    });
  } else {
    list.innerHTML = '<div class="detail-item">Aucun block à afficher.</div>';
  }

  const summary = {};
  events.forEach((event) => {
    summary[event.category] ||= { actions: 0, success: 0 };
    summary[event.category].actions += 1;
    summary[event.category].success += event.result === "ok" ? 1 : 0;
  });

  const rows = Object.entries(summary).map(([category, values]) => ({
    category,
    actions: values.actions,
    réussite: `${Math.round((values.success / values.actions) * 100)}%`,
  }));

  tableContainer.innerHTML = `
    <table>
      <thead><tr><th>Catégorie</th><th>Actions</th><th>Réussite</th></tr></thead>
      <tbody>
        ${rows.map((row) => `<tr><td>${CATEGORY_LABELS[row.category] || row.category}</td><td>${row.actions}</td><td>${row.réussite}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderSankey(events) {
  const chart = document.getElementById("aggregatedSankey");
  const nodes = [];
  const nodeIndex = {};
  const links = {};

  const addNode = (label) => {
    if (!nodeIndex[label]) {
      nodeIndex[label] = nodes.length;
      nodes.push(label);
    }
    return nodeIndex[label];
  };

  const addLink = (from, to, count = 1) => {
    const key = `${from}→${to}`;
    links[key] = (links[key] || 0) + count;
    addNode(from);
    addNode(to);
  };

  if (!events.length) {
    chart.innerHTML = '<div class="detail-item">Aucune donnée à afficher.</div>';
    return;
  }

  addNode("Notre équipe");
  addNode("Point gagné");
  addNode("Point perdu");

  const byCategory = {};
  events.forEach((event) => {
    byCategory[event.category] ||= [];
    byCategory[event.category].push(event);
  });

  Object.entries(byCategory).forEach(([category, categoryEvents]) => {
    const categoryLabel = CATEGORY_LABELS[category] || category;
    addLink("Notre équipe", categoryLabel, categoryEvents.length);

    const bySub = {};
    categoryEvents.forEach((event) => {
      const sub = event.subcategory || "Non précisé";
      bySub[sub] = (bySub[sub] || 0) + 1;
    });

    Object.entries(bySub).forEach(([sub, count]) => {
      const subLabel = sub;
      addLink(categoryLabel, subLabel, count);

      const subEvents = categoryEvents.filter((event) => (event.subcategory || "Non précisé") === sub);
      const byOutcome = {};
      subEvents.forEach((event) => {
        const outcome = event.result === "ok" ? "Point gagné" : "Point perdu";
        byOutcome[outcome] = (byOutcome[outcome] || 0) + 1;
      });

      Object.entries(byOutcome).forEach(([outcome, outcomeCount]) => {
        addLink(subLabel, outcome, outcomeCount);
      });
    });
  });

  const sources = [];
  const targets = [];
  const values = [];

  Object.entries(links).forEach(([key, count]) => {
    const [from, to] = key.split("→");
    sources.push(nodeIndex[from]);
    targets.push(nodeIndex[to]);
    values.push(count);
  });

  const trace = {
    type: "sankey",
    arrangement: "snap",
    node: {
      pad: 20,
      thickness: 18,
      line: { color: "white", width: 1 },
      label: nodes,
      color: nodes.map((node) => {
        if (node === "Notre équipe") return "#E5E1D8";
        if (node === "Point gagné") return "#5C8A2E";
        if (node === "Point perdu") return "#C24B3F";
        return CAT_COLORS[Object.keys(CAT_COLORS).find((cat) => CATEGORY_LABELS[cat] === node) || node] || "#185FA5";
      }),
    },
    link: {
      source: sources,
      target: targets,
      value: values,
      color: values.map(() => "rgba(24,95,165,0.35)"),
    },
  };

  Plotly.newPlot(chart, [trace], { height: 420, margin: { l: 20, r: 20, t: 20, b: 20 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" });
}

function bindScoreSetControl() {
  const select = document.getElementById("scoreSetSelect");
  if (!select) return;
  select.addEventListener("change", () => {
    APP.state.scoreSet = Number(select.value);
    render();
  });
}

function bindSetFilterControl() {
  const select = document.getElementById("setFilterSelect");
  if (!select) return;
  select.addEventListener("change", () => {
    APP.state.setFilter = select.value;
    render();
  });
}

function syncScoreSetSelect() {
  const select = document.getElementById("scoreSetSelect");
  if (!select) return;
  select.value = String(APP.state.scoreSet || 1);
}

function syncSetFilterSelect() {
  const select = document.getElementById("setFilterSelect");
  if (!select) return;
  select.value = APP.state.setFilter || "";
}

function parseSetFromRally(rally) {
  if (rally == null) return "";
  const parts = String(rally).split("-");
  if (!parts.length) return "";
  return parts[0].replace(/^s/i, "");
}

function renderPositionSankey(events) {
  const chart = document.getElementById("positionSankey");
  const nodes = [];
  const nodeIndex = {};
  const links = {};

  const addNode = (label) => {
    if (!nodeIndex[label]) {
      nodeIndex[label] = nodes.length;
      nodes.push(label);
    }
    return nodeIndex[label];
  };

  const addLink = (from, to, count = 1) => {
    const key = `${from}→${to}`;
    links[key] = (links[key] || 0) + count;
    addNode(from);
    addNode(to);
  };

  if (!events.length) {
    chart.innerHTML = '<div class="detail-item">Aucune donnée à afficher.</div>';
    return;
  }

  addLink("Poste de départ", "Poste 1", 0);

  const byPosition = {};
  events.forEach((event) => {
    const position = `Poste ${event.origin}`;
    byPosition[position] ||= [];
    byPosition[position].push(event);
  });

  Object.entries(byPosition).forEach(([position, positionEvents]) => {
    addLink("Poste de départ", position, positionEvents.length);

    const byCategory = {};
    positionEvents.forEach((event) => {
      const category = CATEGORY_LABELS[event.category] || event.category;
      byCategory[category] = (byCategory[category] || 0) + 1;
    });

    Object.entries(byCategory).forEach(([category, count]) => {
      addLink(position, category, count);

      const categoryEvents = positionEvents.filter((event) => (CATEGORY_LABELS[event.category] || event.category) === category);
      const byOutcome = {};
      categoryEvents.forEach((event) => {
        const outcome = event.result === "ok" ? "Point gagné" : "Point perdu";
        byOutcome[outcome] = (byOutcome[outcome] || 0) + 1;
      });

      Object.entries(byOutcome).forEach(([outcome, outcomeCount]) => {
        addLink(category, outcome, outcomeCount);
      });
    });
  });

  const sources = [];
  const targets = [];
  const values = [];

  Object.entries(links).forEach(([key, count]) => {
    const [from, to] = key.split("→");
    sources.push(nodeIndex[from]);
    targets.push(nodeIndex[to]);
    values.push(count);
  });

  const trace = {
    type: "sankey",
    arrangement: "snap",
    node: {
      pad: 20,
      thickness: 18,
      line: { color: "white", width: 1 },
      label: nodes,
      color: nodes.map((node) => {
        if (node === "Poste de départ") return "#E5E1D8";
        if (node === "Point gagné") return "#5C8A2E";
        if (node === "Point perdu") return "#C24B3F";
        if (node.startsWith("Poste ")) return "#8BB8E8";
        return CAT_COLORS[Object.keys(CAT_COLORS).find((cat) => CATEGORY_LABELS[cat] === node) || node] || "#185FA5";
      }),
    },
    link: {
      source: sources,
      target: targets,
      value: values,
      color: values.map(() => "rgba(24,95,165,0.35)"),
    },
  };

  Plotly.newPlot(chart, [trace], { height: 420, margin: { l: 20, r: 20, t: 20, b: 20 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" });
}

function renderSetSankey(events) {
  const chart = document.getElementById("setSankey");
  const nodes = [];
  const nodeIndex = {};
  const links = {};

  const addNode = (label) => {
    if (!nodeIndex[label]) {
      nodeIndex[label] = nodes.length;
      nodes.push(label);
    }
    return nodeIndex[label];
  };

  const addLink = (from, to, count = 1) => {
    const key = `${from}→${to}`;
    links[key] = (links[key] || 0) + count;
    addNode(from);
    addNode(to);
  };

  if (!events.length) {
    chart.innerHTML = '<div class="detail-item">Aucune donnée à afficher.</div>';
    return;
  }

  const bySet = {};
  events.forEach((event) => {
    const setNo = String(event.rally).split("-")[0].slice(1);
    bySet[setNo] ||= [];
    bySet[setNo].push(event);
  });

  addNode("Sets");

  Object.entries(bySet).sort((a, b) => Number(a[0]) - Number(b[0])).forEach(([setNo, setEvents]) => {
    const setLabel = `Set ${setNo}`;
    addLink("Sets", setLabel, setEvents.length);

    const byRally = {};
    setEvents.forEach((event) => {
      const rally = String(event.rally).split("-")[1] || "0";
      const rallyLabel = `Rally ${rally.replace(/^r/i, "")}`;
      byRally[rallyLabel] ||= [];
      byRally[rallyLabel].push(event);
    });

    Object.entries(byRally).sort((a, b) => Number(a[0].replace(/^Rally\s*/i, "")) - Number(b[0].replace(/^Rally\s*/i, ""))).forEach(([rallyLabel, rallyEvents]) => {
      addLink(setLabel, rallyLabel, rallyEvents.length);

      const byOutcome = {};
      rallyEvents.forEach((event) => {
        const outcome = event.result === "ok" ? "Point gagné" : "Point perdu";
        byOutcome[outcome] = (byOutcome[outcome] || 0) + 1;
      });

      Object.entries(byOutcome).forEach(([outcome, count]) => {
        addLink(rallyLabel, outcome, count);
      });
    });
  });

  const sources = [];
  const targets = [];
  const values = [];

  Object.entries(links).forEach(([key, count]) => {
    const [from, to] = key.split("→");
    sources.push(nodeIndex[from]);
    targets.push(nodeIndex[to]);
    values.push(count);
  });

  const trace = {
    type: "sankey",
    arrangement: "snap",
    node: {
      pad: 20,
      thickness: 18,
      line: { color: "white", width: 1 },
      label: nodes,
      color: nodes.map((node) => {
        if (node === "Sets") return "#E5E1D8";
        if (node.startsWith("Set ")) return "#8BB8E8";
        if (node.startsWith("Rally ")) return "#D8A06A";
        if (node === "Point gagné") return "#5C8A2E";
        if (node === "Point perdu") return "#C24B3F";
        return "#185FA5";
      }),
    },
    link: {
      source: sources,
      target: targets,
      value: values,
      color: values.map(() => "rgba(24,95,165,0.35)"),
    },
  };

  Plotly.newPlot(chart, [trace], { height: 420, margin: { l: 20, r: 20, t: 20, b: 20 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" });
}

function getSyntheticSetScores() {
  return [
    {
      set: 1,
      progression: [
        [0, 0], [5, 0], [5, 3], [6, 3], [6, 8], [8, 8], [8, 13], [10, 13], [10, 14], [12, 14], [12, 15], [18, 15], [18, 17], [19, 17], [19, 19], [20, 19], [20, 23], [25, 23],
      ],
    },
    {
      set: 2,
      progression: [
        [0, 0], [3, 0], [3, 2], [5, 2], [6, 2], [6, 6], [8, 6], [8, 10], [10, 10], [10, 13], [12, 13], [12, 16], [14, 16], [14, 19], [15, 19], [15, 22], [18, 22], [20, 22], [21, 22], [25, 22],
      ],
    },
    {
      set: 3,
      progression: [
        [0, 0], [2, 0], [2, 4], [4, 4], [4, 7], [7, 7], [7, 10], [9, 10], [9, 13], [11, 13], [11, 16], [13, 16], [13, 20], [15, 20], [15, 22], [16, 22], [20, 22], [21, 22], [24, 22], [24, 26],
      ],
    },
    {
      set: 4,
      progression: [
        [0, 0], [4, 0], [4, 3], [7, 3], [7, 6], [9, 6], [9, 10], [11, 10], [11, 13], [13, 13], [13, 16], [16, 16], [16, 19], [18, 19], [18, 20], [19, 20], [20, 20], [21, 20], [22, 20], [23, 20], [24, 20], [25, 20], [25, 21],
      ],
    },
  ];
}

function renderRallySankey(events) {
  const chart = document.getElementById("rallySankey");
  const nodes = [];
  const nodeIndex = {};
  const links = {};

  const addNode = (label) => {
    if (!nodeIndex[label]) {
      nodeIndex[label] = nodes.length;
      nodes.push(label);
    }
    return nodeIndex[label];
  };

  const addLink = (from, to, count = 1) => {
    const key = `${from}→${to}`;
    links[key] = (links[key] || 0) + count;
    addNode(from);
    addNode(to);
  };

  if (!events.length) {
    chart.innerHTML = '<div class="detail-item">Aucune donnée à afficher.</div>';
    return;
  }

  const byRally = {};
  events.forEach((event) => {
    const rallyLabel = `Rally ${String(event.rally).split("-")[1] || "0"}`;
    byRally[rallyLabel] ||= [];
    byRally[rallyLabel].push(event);
  });

  addNode("Début de rally");

  Object.entries(byRally).sort((a, b) => Number(a[0].replace(/^Rally\s*/i, "")) - Number(b[0].replace(/^Rally\s*/i, ""))).forEach(([rallyLabel, rallyEvents]) => {
    addLink("Début de rally", rallyLabel, 1);

    const byCategory = {};
    rallyEvents.forEach((event) => {
      const category = CATEGORY_LABELS[event.category] || event.category;
      byCategory[category] = (byCategory[category] || 0) + 1;
    });

    Object.entries(byCategory).forEach(([category, count]) => {
      addLink(rallyLabel, category, count);

      const categoryEvents = rallyEvents.filter((event) => (CATEGORY_LABELS[event.category] || event.category) === category);
      const byOutcome = {};
      categoryEvents.forEach((event) => {
        const outcome = event.result === "ok" ? "Point gagné" : "Point perdu";
        byOutcome[outcome] = (byOutcome[outcome] || 0) + 1;
      });

      Object.entries(byOutcome).forEach(([outcome, outcomeCount]) => {
        addLink(category, outcome, outcomeCount);
      });
    });
  });

  const sources = [];
  const targets = [];
  const values = [];

  Object.entries(links).forEach(([key, count]) => {
    const [from, to] = key.split("→");
    sources.push(nodeIndex[from]);
    targets.push(nodeIndex[to]);
    values.push(count);
  });

  const trace = {
    type: "sankey",
    arrangement: "snap",
    node: {
      pad: 20,
      thickness: 18,
      line: { color: "white", width: 1 },
      label: nodes,
      color: nodes.map((node) => {
        if (node === "Début de rally") return "#E5E1D8";
        if (node.startsWith("Rally ")) return "#D8A06A";
        if (node === "Point gagné") return "#5C8A2E";
        if (node === "Point perdu") return "#C24B3F";
        return CAT_COLORS[Object.keys(CAT_COLORS).find((cat) => CATEGORY_LABELS[cat] === node) || node] || "#185FA5";
      }),
    },
    link: {
      source: sources,
      target: targets,
      value: values,
      color: values.map(() => "rgba(24,95,165,0.35)"),
    },
  };

  Plotly.newPlot(chart, [trace], { height: 420, margin: { l: 20, r: 20, t: 20, b: 20 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" });
}

function renderServiceSequenceSankey(events) {
  const chart = document.getElementById("serviceSequenceSankey");
  const points = getFullPoints(events, APP.data.events);
  if (!Object.keys(points).length) {
    chart.innerHTML = '<div class="detail-item">Aucune donnée à afficher.</div>';
    return;
  }

  const nodeMeta = [];
  const nodeIndex = {};
  const links = {};
  let wonCount = 0;
  let lostCount = 0;
  let maxStep = 0;

  Object.values(points).forEach((pointEvents) => {
    const path = getPointPath(pointEvents);
    maxStep = Math.max(maxStep, path.length - 1);

    path.forEach((item, step) => {
      const label = item.label;
      const side = item.side;
      const key = `${step}::${label}::${side}`;
      if (nodeIndex[key] == null) {
        nodeIndex[key] = nodeMeta.length;
        nodeMeta.push({ key, label, step, side });
      }
    });

    path.forEach((item, step) => {
      const next = path[step + 1];
      if (!next) return;
      const fromKey = `${step}::${item.label}::${item.side}`;
      const toKey = `${step + 1}::${next.label}::${next.side}`;
      const linkKey = `${fromKey}→${toKey}`;
      links[linkKey] = (links[linkKey] || 0) + 1;
    });

    if (path[path.length - 1].label === "Point gagné") {
      wonCount += 1;
    } else {
      lostCount += 1;
    }
  });

  const nodeLabels = nodeMeta.map((node) => node.label);
  const nodeColors = nodeMeta.map(({ label }) => {
    if (label === "Service") return CAT_COLORS.Service;
    if (label === "Reception") return CAT_COLORS.Reception;
    if (label === "Passe") return CAT_COLORS.Passe;
    if (label === "Attaque") return CAT_COLORS.Attaque;
    if (label === "Block") return CAT_COLORS.Block;
    if (label === "Defense") return CAT_COLORS.Defense;
    if (label === "Point gagné") return "#00AA00";
    if (label === "Point perdu") return "#FF0000";
    return "#8BB8E8";
  });

  const nodeX = nodeMeta.map(({ step }) => (maxStep > 0 ? step / maxStep : 0));

  const stepGroups = {};
  nodeMeta.forEach(({ step }, idx) => {
    stepGroups[step] ||= [];
    stepGroups[step].push(idx);
  });
  const nodeY = [];
  Object.values(stepGroups).forEach((indices) => {
    const count = indices.length;
    indices.forEach((nodeIdx, index) => {
      nodeY[nodeIdx] = (index + 1) / (count + 1);
    });
  });

  const sources = [];
  const targets = [];
  const values = [];
  const linkColors = [];

  let linkIndex = 0;
  Object.entries(links).forEach(([linkKey, count]) => {
    const [fromKey, toKey] = linkKey.split("→");
    const source = nodeIndex[fromKey];
    const target = nodeIndex[toKey];
    if (source == null || target == null) return;

    const sourceNode = nodeMeta[source];
    const step = sourceNode.step;
    const isSelected = APP.state.selectedLinks[step] === linkIndex;
    const hasSelectionOnThisStep = APP.state.selectedLinks[step] != null;

    let linkColor;
    const baseColor = sourceNode.side === "own" ? "rgba(0, 102, 255" : "rgba(0, 0, 0";

    if (isSelected) {
      linkColor = baseColor + ", 0.8)";      // Saturé quand sélectionné
    } else if (hasSelectionOnThisStep) {
      linkColor = baseColor + ", 0.1)";      // Très léger quand d'autres sont sélectionnés
    } else {
      linkColor = baseColor + ", 0.3)";      // Léger par défaut
    }

    sources.push(source);
    targets.push(target);
    values.push(count);
    linkColors.push(linkColor);
    linkIndex++;
  });

  const nodeColorsWithTeam = nodeColors.map((color, idx) => {
    const side = nodeMeta[idx].side;
    if (side === "own") {
      return color;
    } else {
      return rgba(color, 0.6);
    }
  });

  const trace = {
    type: "sankey",
    arrangement: "snap",
    node: {
      pad: 20,
      thickness: 20,
      line: { color: "white", width: 6 },
      label: nodeLabels,
      color: nodeColorsWithTeam,
      x: nodeX,
      y: nodeY,
      hovertemplate: "<b>%{label}</b><br>%{value} cas<extra></extra>",
    },
    link: {
      source: sources,
      target: targets,
      value: values,
      color: linkColors,
    },
  };

  Plotly.newPlot(chart, [trace], { height: 700, margin: { l: 10, r: 10, t: 10, b: 10 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" });

  chart.on("plotly_click", (data) => {
    const pointData = data.points[0];
    if (pointData.pointNumber == null) return;

    const linkIdx = pointData.pointNumber;
    let currentLink = 0;

    Object.entries(links).forEach(([linkKey, count]) => {
      const [fromKey, toKey] = linkKey.split("→");
      const source = nodeIndex[fromKey];
      if (source == null) return;

      if (currentLink === linkIdx) {
        const sourceNode = nodeMeta[source];
        const step = sourceNode.step;

        if (APP.state.selectedLinks[step] === linkIdx) {
          delete APP.state.selectedLinks[step];
        } else {
          APP.state.selectedLinks[step] = linkIdx;
        }
        render();
      }
      currentLink++;
    });
  });
}

function getFullRallies(scopedEvents, allEvents) {
  const rallyIds = new Set(scopedEvents.map((event) => event.rally));
  const rallies = {};
  allEvents.forEach((event) => {
    if (rallyIds.has(event.rally)) {
      rallies[event.rally] ||= [];
      rallies[event.rally].push(event);
    }
  });
  Object.values(rallies).forEach((rallyEvents) => rallyEvents.sort((a, b) => a.seq - b.seq));
  return rallies;
}

function getFullPoints(scopedEvents, allEvents) {
  const pointIds = new Set(scopedEvents.map((event) => event.point));
  const points = {};

  allEvents.forEach((event) => {
    if (pointIds.has(event.point)) {
      points[event.point] ||= [];
      points[event.point].push(event);
    }
  });

  Object.values(points).forEach((pointEvents) => {
    pointEvents.sort((a, b) => {
      const [setA, rallyA] = a.rally.split("-R");
      const [setB, rallyB] = b.rally.split("-R");
      const setNumA = Number(setA.slice(1));
      const setNumB = Number(setB.slice(1));
      const rallyNumA = Number(rallyA);
      const rallyNumB = Number(rallyB);
      return setNumA - setNumB || rallyNumA - rallyNumB || a.seq - b.seq;
    });
  });

  return points;
}

function getPointWinner(pointEvents) {
  const last = pointEvents[pointEvents.length - 1];
  if (!last) return "own";
  if (last.result === "ok") {
    return last.origin_side === "own" ? "own" : "opponent";
  }
  return last.origin_side === "own" ? "opponent" : "own";
}

function getPointPath(pointEvents) {
  const path = [{ label: "Service", side: pointEvents[0]?.origin_side || "own" }];
  const first = pointEvents[0];
  if (first.category !== "Service") {
    path[0] = { label: first.category, side: first.origin_side };
  }

  for (let i = 1; i < pointEvents.length; i += 1) {
    const event = pointEvents[i];
    const prev = pointEvents[i - 1];

    if (event.category === "Defense" && prev.category === "Service" && prev.origin_side === "opponent" && event.origin_side === "own") {
      path.push({ label: "Reception", side: "own" });
      continue;
    }

    if (event.category === "Defense" && prev.category === "Service" && prev.origin_side === "own" && event.origin_side === "opponent") {
      path.push({ label: "Defense", side: "opponent" });
      continue;
    }

    if (event.category === "Attaque" || event.category === "Passe" || event.category === "Block") {
      path.push({ label: event.category, side: event.origin_side });
      continue;
    }

    if (event.category === "Service") {
      path.push({ label: "Service", side: event.origin_side });
      continue;
    }

    path.push({ label: event.category, side: event.origin_side });
  }

  const winner = getPointWinner(pointEvents);
  path.push({ label: winner === "own" ? "Point gagné" : "Point perdu", side: winner });
  return path;
}

function getVisibleRallyStats(events) {
  const pointMap = {};
  const pointIds = new Set(events.map((event) => event.point));
  const rallyIds = new Set();

  APP.data.events.forEach((event) => {
    if (!pointIds.has(event.point)) return;
    pointMap[event.point] ||= [];
    pointMap[event.point].push(event);
    rallyIds.add(event.rally);
  });

  const rallyCount = rallyIds.size;
  let pointCount = 0;

  Object.values(pointMap).forEach((pointEvents) => {
    const rallies = {};
    pointEvents.forEach((event) => {
      rallies[event.rally] ||= [];
      rallies[event.rally].push(event);
    });
    const rallyIdsForPoint = Object.keys(rallies).sort((a, b) => Number(a.split("-R")[1]) - Number(b.split("-R")[1]));
    const lastRally = rallies[rallyIdsForPoint[rallyIdsForPoint.length - 1]];
    if (getPointWinner(pointEvents) === "own") {
      pointCount += 1;
    }
  });

  return { rallyCount, pointCount };
}

function normalizeReceptions(events) {
  const eventsByPoint = {};
  events.forEach((event) => {
    eventsByPoint[event.point] ||= [];
    eventsByPoint[event.point].push(event);
  });

  Object.values(eventsByPoint).forEach((pointEvents) => {
    const rallies = {};
    pointEvents.forEach((event) => {
      rallies[event.rally] ||= [];
      rallies[event.rally].push(event);
    });

    const rallyIds = Object.keys(rallies).sort((a, b) => Number(a.split("-R")[1]) - Number(b.split("-R")[1]));
    rallyIds.forEach((rallyId, index) => {
      if (index === 0) return;
      const previousRally = rallies[rallyIds[index - 1]].slice().sort((a, b) => a.seq - b.seq);
      const currentRally = rallies[rallyId].slice().sort((a, b) => a.seq - b.seq);
      const previousFirst = previousRally[0];
      const currentFirst = currentRally[0];

      if (
        previousFirst?.category === "Service" &&
        previousFirst.origin_side === "opponent" &&
        currentFirst?.category === "Defense" &&
        currentFirst.origin_side === "own" &&
        currentFirst.seq === 1
      ) {
        currentFirst.category = "Reception";
      }
    });
  });
}

function rgba(hex, alpha) {
  const clean = hex.replace("#", "");
  const bigint = parseInt(clean, 16);
  const r = (bigint >> 16) & 255;
  const g = (bigint >> 8) & 255;
  const b = bigint & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

function renderScoreboard(events) {
  const chart = document.getElementById("scoreboardChart");
  const traces = [];
  const syntheticSets = getSyntheticSetScores();
  const selectedSets = [String(APP.state.scoreSet || 1)];

  selectedSets.forEach((setNo) => {
    const setData = syntheticSets.find((entry) => String(entry.set) === setNo);
    if (!setData) return;

    const ownX = [];
    const ownY = [];
    const oppX = [];
    const oppY = [];

    setData.progression.forEach(([ownScore, oppScore], index) => {
      ownX.push(index + 1);
      ownY.push(ownScore);
      oppX.push(index + 1);
      oppY.push(oppScore);
    });

    traces.push({
      x: ownX,
      y: ownY,
      type: "scatter",
      mode: "lines",
      line: { color: "#185FA5", width: 2.5 },
      name: `Nous - Set ${setNo}`,
    });
    traces.push({
      x: oppX,
      y: oppY,
      type: "scatter",
      mode: "lines",
      line: { color: "#B4441C", width: 2.2, dash: "dot" },
      name: `Adversaire - Set ${setNo}`,
    });
  });

  Plotly.newPlot(chart, traces, {
    height: 340,
    margin: { l: 10, r: 10, t: 30, b: 10 },
    xaxis: { title: "Rally n°" },
    yaxis: { title: "Points cumulés" },
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)" 
  });
}
