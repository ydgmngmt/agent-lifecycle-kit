// The board's settings from .agents/project.yaml (two levels of `key: value`; a value stops before
// an inline comment or a ` — note`), with LC_* environment overrides. Shared by server.mjs and cli.mjs.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

// The project file's text as { key or block.key: value }, in file order.
export function parseProject(text) {
  const conf = {};
  let block = '';
  for (const line of text.split('\n')) {
    const m = line.match(/^( *)([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const value = m[3].replace(/\s+#.*$/, '').replace(/\s+—.*$/, '').replace(/^["']|["']$/g, '').trim();
    if (!m[1]) block = m[2];
    conf[m[1] ? `${block}.${m[2]}` : m[2]] = value;
  }
  return conf;
}

export function loadConfig(repoDir) {
  const repo = resolve(repoDir);
  let conf = {};
  try {
    conf = parseProject(readFileSync(join(repo, '.agents/project.yaml'), 'utf8'));
  } catch {
    // no project file: defaults below
  }
  const home = (p) => p?.replace(/^~(?=\/|$)/, homedir());
  return {
    repo,
    conf,
    port: Number(process.env.LC_BOARD_PORT || conf['board.port'] || 4777),
    dataDir: home(process.env.LC_BOARD_DIR || conf['board.data_dir'] || (conf.handoff_dir && `${conf.handoff_dir}/board`) || join(repo, '.agents/board')),
    tmuxSession: process.env.LC_TMUX_SESSION || conf['sessions.tmux_session'] || '',
    roadmapPath: conf['docs.roadmap'] && join(repo, conf['docs.roadmap']),
    journeysPath: conf['docs.journeys'] && join(repo, conf['docs.journeys']),
    runningLog: home(conf['board.running_log'] || ''),
    handoffDir: home(conf.handoff_dir || ''),
  };
}
