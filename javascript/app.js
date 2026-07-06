const APP = {
  data: null,
  state: {
    category: null,
    position: null,
    scoreSet: 1,
    scoreCategory: null,
    sequenceFilter: null,
    serviceSeqFilter: null,
    serviceTeamFilter: null,
    setFilter: "",
    selectedLinks: {},
  },
};

const POS_INFO = {
  1: { title: "Zone arrière droite", desc: "Serveur en rotation — libéro ou passeur défensif. Joue en défense à l'arrière droit du terrain." },
  2: { title: "Ailier droit (avant)", desc: "Attaquant de couloir droit, souvent réceptionneur-attaquant. Frappe depuis la zone avant droite." },
  3: { title: "Central avant", desc: "Attaquant rapide en 1er tempo et bloqueur principal. Joue au centre du filet pour couper les accès." },
  4: { title: "Ailier gauche (avant)", desc: "Attaquant principal : reçoit la majorité des ballons d'attaque. Zone de fort volume offensif." },
  5: { title: "Zone arrière gauche", desc: "Défenseur, souvent remplacé par le libéro en réception. Protège l'arrière gauche du terrain." },
  6: { title: "Zone arrière centrale", desc: "Poste du libéro : spécialiste de la réception et de la défense. Joue au centre de l'arrière." },
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
  bindSetFilterControl();
  bindScoreSetControl();
  bindScoreCategoryButtons();
  initExplainerCourt();
  render();
}

function initExplainerCourt() {
  const groups = document.querySelectorAll(".court-pos-group");
  const info = document.getElementById("courtHoverInfo");
  if (!info) return;

  groups.forEach((g) => {
    const pos = Number(g.dataset.pos);
    const circle = g.querySelector("circle");
    const origFill = circle ? circle.getAttribute("fill") : null;
    const origStroke = circle ? circle.getAttribute("stroke") : null;

    g.addEventListener("mouseenter", () => {
      if (circle && origStroke) {
        circle.setAttribute("fill", origStroke);
        circle.setAttribute("fill-opacity", "0.28");
      }
      const data = POS_INFO[pos];
      if (data) {
        info.innerHTML = `<strong class="court-hover-pos">Poste ${pos} — ${data.title}</strong><p class="court-hover-desc">${data.desc}</p>`;
      }
    });

    g.addEventListener("mouseleave", () => {
      if (circle) {
        circle.setAttribute("fill", origFill);
        circle.setAttribute("fill-opacity", "1");
      }
      info.innerHTML = '<span class="court-hover-hint">Survolez un poste pour en savoir plus</span>';
    });
  });
}

function bindScoreCategoryButtons() {
  document.querySelectorAll(".score-cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat || null;
      APP.state.scoreCategory = cat;
      render();
    });
  });
}

function render() {
  syncSetFilterSelect();
  syncScoreSetSelect();
  const filtered = getFilteredEvents();
  renderSummary(filtered);
  renderKpis(filtered);
  renderCourt(filtered);
  renderSunburst(filtered);
  renderDetail(filtered);
  renderServiceSeqLegend();
  renderServiceTeamFilter();
  renderServiceSequenceSankey(filtered);
  renderActionSequenceSankey();
  renderActionSeqLegend();
  renderScoreboard();
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
    ? `Filtres actifs — ${activeFilters.join(" · ")} → <strong>${events.length}</strong> événement(s) sur <strong>${rallyCount}</strong> rallye(s)`
    : "";
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
  if (!events.length) {
    chart.innerHTML = '<div class="detail-item">Aucune donnée à afficher.</div>';
    return;
  }

  const ids = ["root"];
  const labels = ["Notre équipe"];
  const parents = [""];
  const values = [events.length];
  const colors = ["#E5E1D8"];
  const fullOutcomes = getRallyOutcomes(APP.data.events);

  if (!APP.state.category) {
    const byCat = {};
    events.forEach((event) => {
      byCat[event.category] = byCat[event.category] || 0;
      byCat[event.category] += 1;
    });
    Object.entries(byCat).forEach(([category, count]) => {
      ids.push(`cat::${category}`);
      labels.push(CATEGORY_LABELS[category] || category);
      parents.push("root");
      values.push(count);
      colors.push(CAT_COLORS[category]);
    });
  } else {
    const bySub = {};
    events.forEach((event) => {
      const sub = event.subcategory || "Non précisé";
      bySub[sub] = bySub[sub] || { count: 0, rallies: new Set() };
      bySub[sub].count += 1;
      bySub[sub].rallies.add(event.rally);
    });

    const subKeys = Object.keys(bySub).sort();
    const palette = buildSubcategoryPalette(subKeys, CAT_COLORS[APP.state.category]);

    if (APP.state.subcategory) {
      const sub = APP.state.subcategory;
      const subCount = bySub[sub] ? bySub[sub].count : 0;
      ids.push(`sub::${APP.state.category}::${sub}`);
      labels.push(sub);
      parents.push("root");
      values.push(subCount);
      colors.push(palette[sub] || CAT_COLORS[APP.state.category]);

      const outcomeCounts = countOutcomeEvents(bySub[sub]?.rallies || [], fullOutcomes, events);
      Object.entries(outcomeCounts).forEach(([outcome, count]) => {
        ids.push(`out::${APP.state.category}::${sub}::${outcome}`);
        labels.push(outcome);
        parents.push(`sub::${APP.state.category}::${sub}`);
        values.push(count);
        colors.push(OUTCOME_COLORS[outcome]);
      });
    } else {
      subKeys.forEach((sub) => {
        const subCount = bySub[sub].count;
        ids.push(`sub::${APP.state.category}::${sub}`);
        labels.push(sub);
        parents.push("root");
        values.push(subCount);
        colors.push(palette[sub]);

        const outcomeCounts = countOutcomeEvents(bySub[sub].rallies, fullOutcomes, events);
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
    hovertemplate: "<b>%{label}</b><br>%{value} événement(s)<extra></extra>",
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

function countOutcomeEvents(rallies, outcomeMap, events) {
  const counts = { "Point gagné": 0, "Point perdu": 0, Suite: 0 };
  const rallySet = new Set(rallies);
  events.forEach((event) => {
    if (!rallySet.has(event.rally)) return;
    const result = outcomeMap[event.rally] || "Suite";
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

function renderServiceSeqLegend() {
  const container = document.getElementById("serviceSeqLegend");
  if (!container) return;

  const categories = ["Service", "Reception", "Passe", "Attaque", "Block", "Defense"];
  const active = APP.state.serviceSeqFilter;

  container.innerHTML = categories
    .map((cat) => {
      const label = CATEGORY_LABELS[cat] || cat;
      const color = CAT_COLORS[cat] || "#888";
      const isActive = active === cat;
      return `<button class="action-seq-btn${isActive ? " active" : ""}" data-cat="${cat}"
        style="border-color:${color};color:${isActive ? "#fff" : color};background:${isActive ? color : "transparent"}"
      >${label}</button>`;
    })
    .join("");

  container.querySelectorAll(".action-seq-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;
      APP.state.serviceSeqFilter = APP.state.serviceSeqFilter === cat ? null : cat;
      render();
    });
  });
}

function renderServiceTeamFilter() {
  const container = document.getElementById("serviceTeamFilter");
  if (!container) return;
  const options = [
    { label: "Tout", value: null, color: "var(--primary)" },
    { label: "France", value: "own", color: "rgba(0,102,255,1)" },
    { label: "Paraguay", value: "opponent", color: "rgba(80,80,80,1)" },
  ];
  const active = APP.state.serviceTeamFilter;
  container.innerHTML = options.map(({ label, value, color }) => {
    const isActive = active === value;
    const dataVal = value === null ? "" : value;
    return `<button class="score-cat-btn${isActive ? " active" : ""}" data-team="${dataVal}"
      style="${isActive ? `background:${color};border-color:${color};color:#fff` : `border-color:${color};color:${color}`}">
      ${label}</button>`;
  }).join("");
  container.querySelectorAll(".score-cat-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const val = btn.dataset.team || null;
      APP.state.serviceTeamFilter = val;
      render();
    });
  });
}

function renderServiceSequenceSankey(events) {
  const chart = document.getElementById("serviceSequenceSankey");
  const allPoints = getFullPoints(events, APP.data.events);

  const serviceFilter = APP.state.serviceSeqFilter;
  const teamFilter = APP.state.serviceTeamFilter;

  let points = serviceFilter
    ? Object.fromEntries(
        Object.entries(allPoints).filter(([, pointEvents]) =>
          pointEvents.some((e) => e.category === serviceFilter)
        )
      )
    : allPoints;

  if (teamFilter) {
    points = Object.fromEntries(
      Object.entries(points).filter(([, pointEvents]) => {
        const path = getPointPath(pointEvents);
        const start = serviceFilter ? path.findIndex((item) => item.label === serviceFilter) : 0;
        return start >= 0 && path[start]?.side === teamFilter;
      })
    );
  }

  if (!Object.keys(points).length) {
    chart.innerHTML = '<div class="detail-item">Aucune donnée à afficher.</div>';
    return;
  }

  const nodeMeta = [];
  const nodeIndex = {};
  const links = {};
  let maxStep = 0;

  const isTerminalLabel = (label) => label === "Point gagné" || label === "Point perdu";

  Object.values(points).forEach((pointEvents) => {
    let path = getPointPath(pointEvents);
    if (serviceFilter) {
      const startIdx = path.findIndex((item) => item.label === serviceFilter);
      if (startIdx === -1) return;
      path = path.slice(startIdx);
    }
    maxStep = Math.max(maxStep, path.length - 1);

    // Register nodes by category only (no team separation — avoids structural crossings)
    path.forEach((item, step) => {
      const key = `${step}::${item.label}`;
      if (nodeIndex[key] == null) {
        nodeIndex[key] = nodeMeta.length;
        nodeMeta.push({ key, label: item.label, step });
      }
    });

    // Register links — include source side in key to preserve team color on links
    path.forEach((item, step) => {
      const next = path[step + 1];
      if (!next) return;
      const linkKey = `${step}::${item.label}::${item.side}→${step + 1}::${next.label}`;
      links[linkKey] = (links[linkKey] || 0) + 1;
    });
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
  nodeMeta.forEach(({ step }, idx) => { stepGroups[step] ||= []; stepGroups[step].push(idx); });

  // Build sources/targets/values
  const sources = [];
  const targets = [];
  const values = [];
  const linkColors = [];

  const CAT_PRIORITY = ["Service","Reception","Passe","Attaque","Block","Defense","Point gagné","Point perdu"];
  const catRank = (label) => { const i = CAT_PRIORITY.indexOf(label); return i >= 0 ? i : 99; };

  Object.entries(links).forEach(([linkKey, count]) => {
    const arrowIdx = linkKey.indexOf("→");
    const fromPart = linkKey.slice(0, arrowIdx); // "step::label::side"
    const toKey = linkKey.slice(arrowIdx + 1);   // "step::label"
    const [fStep, fLabel, side] = fromPart.split("::");
    const fromKey = `${fStep}::${fLabel}`;
    const source = nodeIndex[fromKey];
    const target = nodeIndex[toKey];
    if (source == null || target == null) return;
    sources.push(source);
    targets.push(target);
    values.push(count * 0.1);
    linkColors.push(side === "own" ? "rgba(0, 102, 255, 0.22)" : "rgba(80, 80, 80, 0.22)");
  });

  // Y positioning: unified barycenter (no band separation — eliminates structural crossings)
  const nodeY = new Array(nodeMeta.length).fill(0.5);

  const assignStep = (stepIdx, sorted) => {
    sorted.forEach((idx, i) => { nodeY[idx] = (i + 1) / (sorted.length + 1); });
  };

  // Initialize by category priority
  for (let step = 0; step <= maxStep; step++) {
    const sorted = (stepGroups[step] || []).slice().sort((a, b) => catRank(nodeMeta[a].label) - catRank(nodeMeta[b].label));
    assignStep(step, sorted);
  }

  // 3-pass barycenter: forward, backward, forward
  for (let pass = 0; pass < 3; pass++) {
    if (pass % 2 === 0) {
      for (let step = 1; step <= maxStep; step++) {
        const nodes = stepGroups[step] || [];
        const bary = {};
        nodes.forEach((idx) => { bary[idx] = { sum: 0, w: 0 }; });
        sources.forEach((src, i) => {
          const tgt = targets[i];
          if (nodeMeta[src].step === step - 1 && bary[tgt] != null) {
            bary[tgt].sum += nodeY[src] * values[i];
            bary[tgt].w += values[i];
          }
        });
        const sorted = [...nodes].sort((a, b) => {
          const ya = bary[a].w > 0 ? bary[a].sum / bary[a].w : nodeY[a];
          const yb = bary[b].w > 0 ? bary[b].sum / bary[b].w : nodeY[b];
          return ya - yb;
        });
        assignStep(step, sorted);
      }
    } else {
      for (let step = maxStep - 1; step >= 0; step--) {
        const nodes = stepGroups[step] || [];
        const bary = {};
        nodes.forEach((idx) => { bary[idx] = { sum: 0, w: 0 }; });
        sources.forEach((src, i) => {
          const tgt = targets[i];
          if (nodeMeta[tgt].step === step + 1 && bary[src] != null) {
            bary[src].sum += nodeY[tgt] * values[i];
            bary[src].w += values[i];
          }
        });
        const sorted = [...nodes].sort((a, b) => {
          const ya = bary[a].w > 0 ? bary[a].sum / bary[a].w : nodeY[a];
          const yb = bary[b].w > 0 ? bary[b].sum / bary[b].w : nodeY[b];
          return ya - yb;
        });
        assignStep(step, sorted);
      }
    }
  }

  const trace = {
    type: "sankey",
    arrangement: "snap",
    node: {
      pad: 60,
      thickness: 12,
      line: { color: "white", width: 2 },
      label: nodeLabels,
      color: nodeColors,
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

  Plotly.newPlot(chart, [trace], { height: 520, margin: { l: 10, r: 10, t: 10, b: 10 }, paper_bgcolor: "rgba(0,0,0,0)", plot_bgcolor: "rgba(0,0,0,0)" });
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

function buildSetScoreData(setNo) {
  const allEvents = APP.data.events.filter((e) => parseSetFromRally(e.rally) === String(setNo));

  const byRally = {};
  allEvents.forEach((e) => {
    byRally[e.rally] = byRally[e.rally] || [];
    byRally[e.rally].push(e);
  });
  Object.values(byRally).forEach((evts) => evts.sort((a, b) => (a.seq || 0) - (b.seq || 0)));

  const rallyKeys = Object.keys(byRally).sort((a, b) => {
    const na = Number(String(a).split("-")[1] || 0);
    const nb = Number(String(b).split("-")[1] || 0);
    return na - nb;
  });

  let fr = 0, py = 0;
  const frProg = [0];
  const pyProg = [0];
  const rallyCatData = [];

  rallyKeys.forEach((key) => {
    const evts = byRally[key];
    const winner = getPointWinner(evts);
    if (winner === "own") fr++;
    else py++;
    frProg.push(fr);
    pyProg.push(py);

    const cat = APP.state.scoreCategory;
    const catEvt = cat ? evts.find((e) => e.category === cat) : null;
    rallyCatData.push(catEvt ? (catEvt.subcategory || "Non précisé") : null);
  });

  return { frProg, pyProg, rallyCatData };
}

function syncScoreCategoryButtons() {
  document.querySelectorAll(".score-cat-btn").forEach((btn) => {
    const cat = btn.dataset.cat || null;
    btn.classList.toggle("active", cat === APP.state.scoreCategory);
  });
}

function renderScoreCatLegend(subcatColors) {
  const legend = document.getElementById("scoreCatLegend");
  if (!legend) return;
  const entries = Object.entries(subcatColors);
  if (!entries.length) {
    legend.innerHTML = "";
    return;
  }
  legend.innerHTML = entries
    .map(([sub, color]) => `<span class="score-cat-legend-item"><span class="score-cat-legend-swatch" style="background:${color}"></span>${sub}</span>`)
    .join("");
}

function renderScoreboard() {
  const chart = document.getElementById("scoreboardChart");
  if (!chart) return;
  const setNo = APP.state.scoreSet || 1;

  syncScoreCategoryButtons();

  let frProg, pyProg, rallyCatData;

  if (APP.state.scoreCategory) {
    ({ frProg, pyProg, rallyCatData } = buildSetScoreData(setNo));
  } else {
    const allSets = getSyntheticSetScores();
    const setData = allSets.find((s) => s.set === setNo);
    if (!setData) return;
    frProg = setData.progression.map((p) => p[0]);
    pyProg = setData.progression.map((p) => p[1]);
    rallyCatData = [];
  }

  const x = frProg.map((_, i) => i);

  const shapes = [];
  const subcatColors = {};

  if (APP.state.scoreCategory && rallyCatData.length) {
    const subkeys = [...new Set(rallyCatData.filter(Boolean))].sort();
    const palette = buildSubcategoryPalette(subkeys, CAT_COLORS[APP.state.scoreCategory]);
    subkeys.forEach((k) => (subcatColors[k] = palette[k]));

    rallyCatData.forEach((subcat, i) => {
      if (!subcat) return;
      shapes.push({
        type: "rect",
        xref: "x",
        yref: "paper",
        x0: i + 0.93,
        x1: i + 1.07,
        y0: 0,
        y1: 1,
        fillcolor: rgba(subcatColors[subcat] || "#888888", 0.55),
        line: { width: 0 },
        layer: "below",
      });
    });
  }

  Plotly.newPlot(
    chart,
    [
      { x, y: frProg, type: "scatter", mode: "lines", line: { color: "#185FA5", width: 2.5 }, name: `France – Set ${setNo}` },
      { x, y: pyProg, type: "scatter", mode: "lines", line: { color: "#B4441C", width: 2.2, dash: "dot" }, name: `Paraguay – Set ${setNo}` },
    ],
    {
      height: 340,
      margin: { l: 10, r: 10, t: 10, b: 40 },
      xaxis: { title: "Rally n°" },
      yaxis: { title: "Points cumulés" },
      paper_bgcolor: "rgba(0,0,0,0)",
      plot_bgcolor: "rgba(0,0,0,0)",
      legend: { orientation: "h", y: -0.2 },
      shapes,
    }
  );

  renderScoreCatLegend(subcatColors);
}

function renderActionSeqLegend() {
  const container = document.getElementById("actionSeqLegend");
  if (!container) return;

  const categories = ["Service", "Reception", "Passe", "Attaque", "Block", "Defense"];
  const active = APP.state.sequenceFilter;

  container.innerHTML = categories
    .map((cat) => {
      const label = CATEGORY_LABELS[cat] || cat;
      const color = CAT_COLORS[cat] || "#888";
      const isActive = active === cat;
      return `<button class="action-seq-btn${isActive ? " active" : ""}" data-cat="${cat}"
        style="border-color:${color};color:${isActive ? "#fff" : color};background:${isActive ? color : "transparent"}"
      >${label}</button>`;
    })
    .join("");

  container.querySelectorAll(".action-seq-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cat = btn.dataset.cat;
      APP.state.sequenceFilter = APP.state.sequenceFilter === cat ? null : cat;
      render();
    });
  });
}

function renderActionSequenceSankey() {
  const chart = document.getElementById("actionSequenceSankey");
  if (!chart) return;

  // Group all events by rally, sorted by seq
  const byRally = {};
  APP.data.events.forEach((e) => {
    byRally[e.rally] = byRally[e.rally] || [];
    byRally[e.rally].push(e);
  });
  Object.values(byRally).forEach((evts) => evts.sort((a, b) => (a.seq || 0) - (b.seq || 0)));

  const filter = APP.state.sequenceFilter;

  // Build N→N+1 and (contextual) N+1→N+2 transition counts
  const trans01 = {};
  const trans12 = {};
  const origCounts01 = {};
  const origCounts12 = {};

  Object.values(byRally).forEach((evts) => {
    for (let i = 0; i < evts.length; i++) {
      const cat0 = evts[i]?.category;
      if (!cat0) continue;
      if (filter && cat0 !== filter) continue;

      const cat1 = evts[i + 1]?.category;
      const cat2 = evts[i + 2]?.category;

      if (cat1) {
        trans01[cat0] = trans01[cat0] || {};
        trans01[cat0][cat1] = (trans01[cat0][cat1] || 0) + 1;

        if (cat2) {
          trans12[cat1] = trans12[cat1] || {};
          trans12[cat1][cat2] = (trans12[cat1][cat2] || 0) + 1;
        }
      }
    }
  });

  if (!Object.keys(trans01).length) {
    chart.innerHTML = '<div class="detail-item">Aucune transition à afficher.</div>';
    return;
  }

  // Build step-qualified nodes
  const nodeIndex = {};
  const nodeMeta = [];

  const addNode = (step, cat) => {
    const key = `${step}::${cat}`;
    if (nodeIndex[key] == null) {
      nodeIndex[key] = nodeMeta.length;
      nodeMeta.push({ key, step, cat });
    }
    return nodeIndex[key];
  };

  const sources = [], targets = [], values = [], origCounts = [], linkColors = [];

  Object.entries(trans01).forEach(([cat0, nexts]) => {
    addNode(0, cat0);
    Object.entries(nexts).forEach(([cat1, count]) => {
      addNode(1, cat1);
      sources.push(nodeIndex[`0::${cat0}`]);
      targets.push(nodeIndex[`1::${cat1}`]);
      values.push(count * 0.1);
      origCounts.push(count);
      linkColors.push(rgba(CAT_COLORS[cat0] || "#888888", 0.35));
    });
  });

  Object.entries(trans12).forEach(([cat1, nexts]) => {
    addNode(1, cat1);
    Object.entries(nexts).forEach(([cat2, count]) => {
      addNode(2, cat2);
      sources.push(nodeIndex[`1::${cat1}`]);
      targets.push(nodeIndex[`2::${cat2}`]);
      values.push(count * 0.1);
      origCounts.push(count);
      linkColors.push(rgba(CAT_COLORS[cat1] || "#888888", 0.35));
    });
  });

  // Position nodes by step
  const stepGroups = {};
  nodeMeta.forEach(({ step }, idx) => {
    stepGroups[step] = stepGroups[step] || [];
    stepGroups[step].push(idx);
  });

  const stepX = [0.02, 0.5, 0.98];
  const nodeX = nodeMeta.map(({ step }) => stepX[step]);
  const nodeY = new Array(nodeMeta.length);
  Object.values(stepGroups).forEach((indices) => {
    indices.forEach((nodeIdx, i) => {
      nodeY[nodeIdx] = (i + 1) / (indices.length + 1);
    });
  });

  const nodeLabels = nodeMeta.map(({ cat }) => CATEGORY_LABELS[cat] || cat);
  const nodeColors = nodeMeta.map(({ cat }) => CAT_COLORS[cat] || "#8BB8E8");

  const trace = {
    type: "sankey",
    arrangement: "snap",
    node: {
      pad: 18,
      thickness: 12,
      line: { color: "white", width: 1 },
      label: nodeLabels,
      color: nodeColors,
      x: nodeX,
      y: nodeY,
      hovertemplate: "<b>%{label}</b><extra></extra>",
    },
    link: {
      source: sources,
      target: targets,
      value: values,
      customdata: origCounts,
      color: linkColors,
      hovertemplate: "<b>%{source.label} → %{target.label}</b><br>%{customdata} transitions<extra></extra>",
    },
  };

  Plotly.newPlot(chart, [trace], {
    height: 420,
    margin: { l: 10, r: 10, t: 36, b: 10 },
    annotations: [
      { text: "N — Action", x: 0.02, y: 1.06, xref: "paper", yref: "paper", showarrow: false, font: { size: 12, color: "#64748b" }, xanchor: "left" },
      { text: "N+1 — Suivant", x: 0.5, y: 1.06, xref: "paper", yref: "paper", showarrow: false, font: { size: 12, color: "#64748b" }, xanchor: "center" },
      { text: "N+2 — Après", x: 0.98, y: 1.06, xref: "paper", yref: "paper", showarrow: false, font: { size: 12, color: "#64748b" }, xanchor: "right" },
    ],
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
  });
}
