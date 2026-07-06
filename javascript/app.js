const APP = {
  data: null,
  state: {
    category: null,
    position: null,
    scoreSet: 1,
  },
};

const CAT_COLORS = {
  Service: "#185FA5",
  Reception: "#534AB7",
  Passe: "#993556",
  Attaque: "#D85A30",
  Block: "#993C1D",
  Defense: "#0F6E56",
};

const CATEGORY_LABELS = {
  Service: "Service",
  Reception: "Réception",
  Passe: "Passe",
  Attaque: "Attaque",
  Block: "Block",
  Defense: "Défense",
};

const OWN = { 4: [120, 220], 3: [220, 220], 2: [320, 220], 5: [120, 320], 6: [220, 320], 1: [320, 320] };
const OPP = { 2: [120, 90], 3: [220, 90], 4: [320, 90], 1: [120, 190], 6: [220, 190], 5: [320, 190] };

window.addEventListener("DOMContentLoaded", init);

async function init() {
  const response = await fetch("./data.json");
  APP.data = await response.json();
  if (!APP.data?.events?.length) {
    document.getElementById("kpiGrid").innerHTML = "<p>Impossible de charger les données.</p>";
    return;
  }
  bindScoreSetControl();
  render();
}

function render() {
  syncScoreSetSelect();
  const filtered = getFilteredEvents();
  renderSummary(filtered);
  renderKpis(filtered);
  renderCourt(filtered);
  renderSunburst(filtered);
  renderDetail(filtered);
  renderSankey(filtered);
  renderPositionSankey(filtered);
  renderSetSankey(filtered);
  renderRallySankey(filtered);
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

  if (APP.state.category) {
    events = events.filter((event) => event.category === APP.state.category);
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
  if (APP.state.category) {
    activeFilters.push(`catégorie <strong>${CATEGORY_LABELS[APP.state.category] || APP.state.category}</strong>`);
  }

  summary.innerHTML = activeFilters.length
    ? `Vue filtrée — ${activeFilters.join(" · ")} → <strong>${events.length}</strong> événement(s)`
    : `Vue unique — <strong>${events.length}</strong> événements de notre équipe`;
}

function renderKpis(events) {
  const grid = document.getElementById("kpiGrid");
  const points = events.filter((event) => event.result === "ok" && ["Attaque", "Service", "Block"].includes(event.category)).length;
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
    { label: "Points marqués", value: points, hint: "Actions réussies en attaque/service/block" },
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
  const svg = createSvgElement("svg", { viewBox: "0 0 460 420", width: "100%", height: "420" });

  drawCourtBase(svg);
  drawPositions(svg, events);
  drawRoutes(svg, events);
  container.appendChild(svg);
}

function drawCourtBase(svg) {
  const court = createSvgElement("rect", { x: 40, y: 60, width: 380, height: 300, rx: 14, fill: "#f8fbff", stroke: "#b9c9da", "stroke-width": 2 });
  const centerLine = createSvgElement("line", { x1: 230, y1: 60, x2: 230, y2: 360, stroke: "#c4d8e8", "stroke-width": 2 });
  const topZone = createSvgElement("rect", { x: 40, y: 60, width: 380, height: 150, fill: "none", stroke: "#dce8f3", "stroke-width": 1 });
  const bottomZone = createSvgElement("rect", { x: 40, y: 210, width: 380, height: 150, fill: "none", stroke: "#dce8f3", "stroke-width": 1 });
  const labelTop = createSvgElement("text", { x: 230, y: 40, "text-anchor": "middle", fill: "#64748b", "font-size": 14 }, "Terrain adverse");
  const labelBottom = createSvgElement("text", { x: 230, y: 392, "text-anchor": "middle", fill: "#64748b", "font-size": 14 }, "Notre terrain");
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

function drawRoutes(svg, events) {
  const grouped = {};
  events.forEach((event) => {
    const key = [event.category, event.origin, event.origin_side, event.destination, event.dest_side].join("::");
    grouped[key] = (grouped[key] || 0) + 1;
  });

  const entries = Object.entries(grouped);
  if (!entries.length) return;
  const maxCount = Math.max(...entries.map(([, count]) => count));

  entries.forEach(([key, count]) => {
    const [category, origin, originSide, destination, destSide] = key.split("::");
    const from = getCoords(originSide, Number(origin));
    const to = getCoords(destSide, Number(destination));
    const strokeWidth = 1.6 + Math.sqrt(count / maxCount) * 4.2;
    drawRoute(svg, from, to, CAT_COLORS[category] || "#185FA5", strokeWidth);
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
  const ids = ["root"];
  const labels = ["Notre équipe"];
  const parents = [""];
  const values = [events.length || 0];
  const colors = ["#E5E1D8"];

  if (APP.state.category) {
    const focusEvents = events.filter((event) => event.category === APP.state.category);
    const bySub = {};
    focusEvents.forEach((event) => {
      const sub = event.subcategory || "Non précisé";
      bySub[sub] = (bySub[sub] || 0) + 1;
    });
    Object.entries(bySub).forEach(([sub, count]) => {
      ids.push(`sub::${APP.state.category}::${sub}`);
      labels.push(sub);
      parents.push("root");
      values.push(count);
      colors.push(CAT_COLORS[APP.state.category]);
    });
  } else {
    const byCat = {};
    events.forEach((event) => {
      byCat[event.category] = (byCat[event.category] || 0) + 1;
    });
    Object.entries(byCat).forEach(([category, count]) => {
      ids.push(`cat::${category}`);
      labels.push(CATEGORY_LABELS[category] || category);
      parents.push("root");
      values.push(count);
      colors.push(CAT_COLORS[category]);
    });
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
    } else if (id.startsWith("cat::")) {
      APP.state.category = id.split("::")[1];
    }
    render();
  });
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

function syncScoreSetSelect() {
  const select = document.getElementById("scoreSetSelect");
  if (!select) return;
  select.value = String(APP.state.scoreSet || 1);
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

  const rallyGroups = {};
  events.forEach((event) => {
    rallyGroups[event.rally] ||= [];
    rallyGroups[event.rally].push(event);
  });

  const serviceRallies = Object.values(rallyGroups)
    .map((list) => list.sort((a, b) => a.seq - b.seq))
    .filter((list) => list.length && list[0].category === "Service");

  if (!serviceRallies.length) {
    chart.innerHTML = '<div class="detail-item">Aucun rally de départ Service à afficher.</div>';
    return;
  }

  addNode("Service");

  serviceRallies.forEach((rallyEvents) => {
    const sequence = rallyEvents.map((event) => CATEGORY_LABELS[event.category] || event.category);
    const outcome = rallyEvents[rallyEvents.length - 1]?.result === "ok" ? "Point gagné" : "Point perdu";
    const patternLabel = `${sequence.join(" → ")} → ${outcome}`;
    addLink("Service", patternLabel, 1);
    addLink(patternLabel, outcome, 1);
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
        if (node === "Service") return "#185FA5";
        if (node === "Point gagné") return "#5C8A2E";
        if (node === "Point perdu") return "#C24B3F";
        return "#8BB8E8";
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
