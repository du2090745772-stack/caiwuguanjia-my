/* 纯 SVG 图表：环形占比图、每日柱状、逐月折线。零第三方依赖，满足 PRD 首屏 ≤500KB。 */
(function (global) {
  'use strict';

  const NS = 'http://www.w3.org/2000/svg';
  const PALETTE = ['#FF8FAB', '#FFB26B', '#7BC8A4', '#9BC4E2', '#CBA6D8', '#E8A0A6', '#8FD3C9', '#F2C063', '#B6A58F', '#A9B6E8'];

  function el(name, attrs, parent) {
    const node = document.createElementNS(NS, name);
    Object.keys(attrs || {}).forEach((k) => node.setAttribute(k, attrs[k]));
    if (parent) parent.appendChild(node);
    return node;
  }
  function tag(name, cls, parent) {
    const node = document.createElement(name);
    if (cls) node.className = cls;
    if (parent) parent.appendChild(node);
    return node;
  }
  const fmtCents = (c) => global.Logic.fmtCents(c);

  function tipLayer(container) {
    let tip = container.querySelector(':scope > .tooltip');
    if (!tip) {
      tip = tag('div', 'tooltip', container);
      tip.setAttribute('aria-hidden', 'true');
    }
    return tip;
  }

  function bindTip(container, node, htmlFor) {
    const tip = tipLayer(container);
    const show = (evt) => {
      const box = container.getBoundingClientRect();
      const x = evt.clientX - box.left;
      const y = evt.clientY - box.top;
      tip.innerHTML = htmlFor();
      tip.style.left = Math.max(48, Math.min(box.width - 48, x)) + 'px';
      tip.style.top = Math.max(28, y - 10) + 'px';
      tip.classList.add('is-on');
    };
    node.addEventListener('pointerenter', show);
    node.addEventListener('pointermove', show);
    node.addEventListener('pointerleave', () => tip.classList.remove('is-on'));
    node.addEventListener('blur', () => tip.classList.remove('is-on'));
  }

  function niceMax(v) {
    if (v <= 0) return 100;
    const exp = Math.pow(10, Math.floor(Math.log10(v)));
    const f = v / exp;
    const step = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
    return step * exp;
  }

  function arcPath(cx, cy, rOut, rIn, a0, a1) {
    const pt = (r, a) => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const [x0, y0] = pt(rOut, a0);
    const [x1, y1] = pt(rOut, a1);
    const [x2, y2] = pt(rIn, a1);
    const [x3, y3] = pt(rIn, a0);
    return 'M' + x0 + ' ' + y0 + 'A' + rOut + ' ' + rOut + ' 0 ' + large + ' 1 ' + x1 + ' ' + y1 +
      'L' + x2 + ' ' + y2 + 'A' + rIn + ' ' + rIn + ' 0 ' + large + ' 0 ' + x3 + ' ' + y3 + 'Z';
  }

  /** PRD STAT-02 环形占比图 + 图例下钻 */
  function donut(container, opts) {
    const { items, centerLabel, centerValue, onSelect, activeId } = opts;
    container.innerHTML = '';
    if (!items.length) {
      tag('p', 'empty__hint', container).textContent = '这段时间还没有记录';
      return;
    }
    const size = 200, c = size / 2, rOut = 88, rIn = 58, gap = 0.025;
    const svg = el('svg', { viewBox: '0 0 ' + size + ' ' + size, role: 'img', 'aria-label': centerLabel + ' ' + centerValue }, container);
    svg.style.maxWidth = '200px';
    svg.style.margin = '0 auto';
    svg.style.display = 'block';

    let angle = -Math.PI / 2;
    items.forEach((item, i) => {
      const sweep = Math.max(0.02, item.pct * Math.PI * 2 - gap);
      const color = PALETTE[i % PALETTE.length];
      item.color = color;
      const path = el('path', {
        d: arcPath(c, c, rOut, rIn, angle, angle + sweep),
        fill: color, class: 'slice' + (activeId && activeId === item.id ? ' is-active' : ''),
        tabindex: '0', role: 'button',
        'aria-label': item.name + ' ' + fmtCents(item.cents) + ' 占 ' + Math.round(item.pct * 100) + '%'
      }, svg);
      const html = () => '<b>' + item.name + '</b> ¥' + fmtCents(item.cents) + ' · ' + (item.pct * 100).toFixed(1) + '%';
      bindTip(container, path, html);
      const pick = () => onSelect && onSelect(item);
      path.addEventListener('click', pick);
      path.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); }
      });
      angle += sweep + gap;
    });

    const text = (y, cls, value) => {
      const t = el('text', { x: c, y, 'text-anchor': 'middle', class: cls }, svg);
      t.textContent = value;
    };
    text(c - 4, 'donut-center__label', centerLabel);
    text(c + 18, 'donut-center__value', '¥' + centerValue);

    const legend = tag('ul', 'legend', container);
    items.forEach((item, i) => {
      const li = tag('li', '', legend);
      const btn = tag('button', '', li);
      btn.type = 'button';
      if (activeId === item.id) btn.classList.add('is-active');
      btn.setAttribute('aria-label', '查看' + item.name + '明细');
      const sw = tag('span', 'legend__swatch', btn);
      sw.style.background = PALETTE[i % PALETTE.length];
      tag('span', 'legend__name', btn).textContent = item.name;
      tag('span', 'legend__val', btn).textContent = '¥' + fmtCents(item.cents);
      tag('span', 'legend__pct', btn).textContent = (item.pct * 100).toFixed(0) + '%';
      btn.addEventListener('click', () => onSelect && onSelect(item));
    });
  }

  /** PRD STAT-03 月视图：每日支出柱状图 */
  function bars(container, opts) {
    const { data, onSelect, activeKey } = opts;
    container.innerHTML = '';
    const max = niceMax(Math.max.apply(null, data.map((d) => d.value || 0)));
    if (max === 0 || data.every((d) => !d.value)) {
      tag('p', 'empty__hint', container).textContent = '这段时间还没有支出';
    }
    const W = Math.max(320, data.length * 11), H = 170, padB = 22, padT = 18;
    const plot = H - padB - padT;
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': '每日支出柱状图' }, container);
    el('line', { x1: 0, y1: padT, x2: W, y2: padT, class: 'grid-line' }, svg);
    const cap = el('text', { x: 0, y: padT - 6, class: 'axis-label' }, svg);
    cap.textContent = '¥' + fmtCents(max);

    const step = W / data.length;
    const bw = Math.max(4, Math.min(14, step - 4));
    data.forEach((d, i) => {
      const h = d.value ? Math.max(2, (d.value / max) * plot) : 0;
      const x = i * step + (step - bw) / 2;
      const y = padT + plot - h;
      let rect = null;
      if (d.value) {
        rect = el('rect', {
          x, y: padT + plot, width: bw, height: 0, rx: Math.min(4, bw / 2),
          fill: d.isToday ? '#F4759B' : '#FF8FAB', class: 'bar' + (activeKey === d.key ? ' is-active' : '')
        }, svg);
      }
      const hit = el('rect', { x: i * step, y: padT, width: step, height: plot, class: 'hit', tabindex: '0' }, svg);
      bindTip(container, hit, () => '<b>' + d.label + '</b> ¥' + fmtCents(d.value));
      hit.addEventListener('click', () => onSelect && onSelect(d));
      hit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') onSelect && onSelect(d);
      });
      if (rect) {
        UI.raf(() => {
          rect.setAttribute('y', y);
          rect.setAttribute('height', h);
        });
      }
      if (d.tickLabel) {
        const t = el('text', { x: i * step + step / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis-label' }, svg);
        t.textContent = d.tickLabel;
      }
    });
  }

  /** PRD STAT-03 年视图：逐月收支折线 */
  function lines(container, opts) {
    const { xLabels, series, onSelect, activeKey } = opts;
    container.innerHTML = '';
    const allVals = series.reduce((a, s) => a.concat(s.values), []);
    const max = niceMax(Math.max.apply(null, allVals.concat([0])));
    const W = 340, H = 170, padL = 8, padR = 8, padT = 18, padB = 22;
    const plot = H - padB - padT;
    const innerW = W - padL - padR;
    const svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': '逐月收支折线图' }, container);

    [0, 0.5, 1].forEach((f) => {
      const y = padT + plot * (1 - f);
      el('line', { x1: padL, y1: y, x2: W - padR, y2: y, class: 'grid-line' }, svg);
      const t = el('text', { x: padL, y: y - 3, class: 'axis-label' }, svg);
      t.textContent = f === 0 ? '0' : '¥' + global.Logic.fmtWan(max * f);
    });

    const xAt = (i) => padL + (innerW / (xLabels.length - 1 || 1)) * i;
    const yAt = (v) => padT + plot - (v / max) * plot;

    series.forEach((s) => {
      const pts = s.values.map((v, i) => xAt(i) + ',' + yAt(v)).join(' ');
      el('polyline', { points: pts, class: 'spark', stroke: s.color }, svg);
      s.values.forEach((v, i) => {
        el('circle', { cx: xAt(i), cy: yAt(v), r: v ? 3 : 2, fill: s.color, opacity: v ? 1 : 0.35 }, svg);
      });
    });

    xLabels.forEach((label, i) => {
      const t = el('text', { x: xAt(i), y: H - 6, 'text-anchor': 'middle', class: 'axis-label' }, svg);
      t.textContent = label;
    });

    const bandW = innerW / (xLabels.length - 1 || 1);
    xLabels.forEach((label, i) => {
      const hit = el('rect', {
        x: xAt(i) - bandW / 2, y: padT, width: bandW, height: plot, class: 'hit', tabindex: '0'
      }, svg);
      bindTip(container, hit, () => {
        const rows = series.map((s) => s.name + ' ¥' + fmtCents(s.values[i])).join('　');
        return '<b>' + label + '</b> ' + rows;
      });
      hit.addEventListener('click', () => onSelect && onSelect({ index: i, label }));
    });
  }

  global.Charts = { donut, bars, lines, PALETTE, niceMax };
})(typeof window !== 'undefined' ? window : globalThis);
