#!/usr/bin/env python3
"""Render exportable charts from analyze-catalogue.mjs output.

Requires matplotlib in an isolated analysis environment; no app dependency.
Usage: python scripts/plot-catalogue-insights.py docs/insights/2026-10-11
"""
import json
import sys
from datetime import datetime
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

folder = Path(sys.argv[1])
data = json.loads((folder / 'catalogue.json').read_text())
plt.rcParams.update({'font.family': 'DejaVu Sans', 'font.size': 11,
                     'axes.spines.top': False, 'axes.spines.right': False,
                     'axes.spines.bottom': False, 'axes.spines.left': False,
                     'svg.fonttype': 'path', 'figure.facecolor': '#fcfcf9',
                     'axes.facecolor': '#fcfcf9'})
navy, gold, muted = '#214c66', '#ae6a0a', '#b8c4cd'
n = data['totals']['entries']
linked_count = data['totals']['linkedEntries']
snapshot = datetime.fromisoformat(data['snapshotAt'].replace('Z', '+00:00'))
snapshot_label = snapshot.strftime('%d %b %Y')

def bars(ax, values, labels, title, denominator, missing=()):
    names = list(values)
    ax.barh(range(len(names)), [values[k] for k in names], height=.68,
            color=[muted if k in missing else navy for k in names])
    ax.set_yticks(range(len(names)), [labels.get(k, k.title()) for k in names])
    ax.invert_yaxis()
    ax.set_xlim(0, max(values.values()) * 1.38)
    ax.set_xticks([])
    ax.tick_params(axis='y', length=0, pad=9)
    ax.set_title(title, loc='left', fontweight='bold', pad=18, fontsize=14)
    for i, k in enumerate(names):
        ax.text(values[k] + max(values.values())*.025, i,
                f'{values[k]:,}  ({values[k]/denominator:.1%})', va='center', fontsize=10)

fig, axes = plt.subplots(1, 2, figsize=(12.5, 5.6))
bars(axes[0], data['categories'], {'rpg':'RPG', 'other':'Other / nonspecific'},
     f'Recorded genre · all {n:,} entries', n, ('other',))
linked = {k:v for k,v in data['distributions'].items() if k != 'unlisted'}
bars(axes[1], linked, {'website':'Other websites', 'itch':'itch.io', 'steam':'Steam',
     'google-play':'Google Play', 'app-store':'App Store', 'github':'GitHub repository',
     'crazygames':'CrazyGames', 'game-jolt':'Game Jolt'},
     f'Destination · {linked_count:,} linked entries', linked_count)
fig.subplots_adjust(left=.14, right=.98, bottom=.12, top=.89, wspace=.78)
fig.text(.02,.025,f'Playtrace public snapshot · {snapshot_label}. {n-linked_count:,} entries have no project link. These are catalogue counts, not market shares.',fontsize=9,color='#4e6170')
fig.savefig(folder/'catalogue-mix.svg', metadata={'Date':data['snapshotAt']})
plt.close(fig)

fig, axes = plt.subplots(1, 2, figsize=(12.5, 4.9))
bars(axes[0], data['stages'], {'unknown':'Unspecified'}, f'Recorded stage · all {n:,} entries',n,('unknown',))
checked_count = data['availability']['checkedEntries']
bars(axes[1], data['availability']['byStatus'], {}, f'Link observations · {checked_count:,} checked',checked_count,('unverified','blocked'))
fig.subplots_adjust(left=.11, right=.98, bottom=.14, top=.87, wspace=.62)
broken_playable = data['availability']['brokenMarkedPlayableOrReleased']
fig.text(.02,.03,f'HTTP success does not prove playability. {broken_playable} entries labeled playable/released have a broken destination. Stage ≠ build type.',fontsize=9,color='#4e6170')
fig.savefig(folder/'readiness.svg',metadata={'Date':data['snapshotAt']})
plt.close(fig)

month_ids = [snapshot.year*12 + snapshot.month-1 - offset for offset in range(11,-1,-1)]
months = {f'{m//12:04}-{m%12+1:02}':data['firstSharedMonth'].get(f'{m//12:04}-{m%12+1:02}',0) for m in month_ids}
fig, ax = plt.subplots(figsize=(12.5,4.2))
ax.bar(range(len(months)), list(months.values()), color=[gold if k==snapshot.strftime('%Y-%m') else navy for k in months],width=.65)
ax.set_xticks(range(len(months)),list(months),rotation=30,ha='right',fontsize=9)
ax.set_ylim(0,max(months.values())*1.2)
ax.tick_params(axis='both',length=0)
ax.set_title('First shared in the captured catalogue · latest 12 calendar months',loc='left',fontweight='bold',pad=16,fontsize=14)
for i,v in enumerate(months.values()): ax.text(i,v+7,str(v),ha='center',fontsize=10)
fig.subplots_adjust(left=.06,right=.98,bottom=.28,top=.85)
fig.text(.02,.03,f'Latest month is partial through {snapshot_label}. Archive/flair selection and backfill affect the series. This is not a launch timeline or growth forecast.',fontsize=9,color='#4e6170')
fig.savefig(folder/'sharing-history.svg',metadata={'Date':data['snapshotAt']})
plt.close(fig)
print('Created 3 SVG figures from the dated catalogue summary.')
