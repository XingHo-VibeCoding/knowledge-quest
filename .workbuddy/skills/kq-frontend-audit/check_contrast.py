#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""知识闯关 · 文字对比度复算（WCAG AA）

用法：
    python check_contrast.py                # 读同目录 contrast-pairs.json
    python check_contrast.py pairs.json     # 指定配对清单

判定：普通文字 >= 4.5:1；大字（>=24px 或 >=18.66px 且粗体）>= 3:1。
退出码：0 = 全部达标；1 = 存在不达标（CI/人工都不许放过）。
"""
import json
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


def lum(hex_color):
    h = hex_color.strip().lstrip('#')
    if len(h) == 3:
        h = ''.join(c * 2 for c in h)
    r, g, b = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    f = lambda c: c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)


def ratio(fg, bg):
    a, b = lum(fg), lum(bg)
    if a < b:
        a, b = b, a
    return (a + 0.05) / (b + 0.05)


def is_large(size, bold):
    return size >= 24 or (size >= 18.66 and bold)


def main():
    here = os.path.dirname(os.path.abspath(__file__))
    path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(here, 'contrast-pairs.json')
    with open(path, encoding='utf-8') as fh:
        data = json.load(fh)
    pairs = data['pairs']

    print('对比度复算：%s' % path)
    print('%-40s %-9s %-9s %-11s %-7s %s' % ('配对', 'FG', 'BG', '字号', '比值', '判定'))
    print('-' * 92)
    fails = []
    for p in pairs:
        r = ratio(p['fg'], p['bg'])
        bold = bool(p.get('bold'))
        size = float(p.get('size', 14))
        need = 3.0 if is_large(size, bold) else 4.5
        ok = r >= need
        size_txt = '%gpx%s' % (size, '/粗' if bold else '')
        print('%-40s %-9s %-9s %-11s %6.2f %s%s' % (
            p['name'], p['fg'], p['bg'], size_txt, r, 'PASS' if ok else 'FAIL',
            '' if ok else '  <- 需 >= %.1f:1' % need))
        if not ok:
            fails.append((p['name'], r, need))
    print('-' * 92)
    print('共 %d 对，FAIL %d 对' % (len(pairs), len(fails)))
    for name, r, need in fails:
        print('  [X] %s: %.2f:1（需 >= %.1f:1，差 %.2f）' % (name, r, need, need - r))
    return 1 if fails else 0


if __name__ == '__main__':
    sys.exit(main())
