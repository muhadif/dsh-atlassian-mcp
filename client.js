/**
 * Client half: the settings card on the Plugins page.
 *
 * The card owns the endpoint. Switching it re-registers the MCP server on the Host, so the tool
 * list changes without editing the profile patch or restarting DSH.
 */

window.__ModuleLoader__.load({
  id: 'dsh-atlassian-mcp',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useState } = React

    const NS = 'dsh-atlassian-mcp'

    const DICT = {
      en: {
        title: 'Atlassian Confluence & Jira',
        summary: 'Confluence and Jira tools through Atlassian\'s remote MCP server.',
        endpoint: 'Endpoint',
        custom: 'Custom URL',
        customPlaceholder: 'https://…',
        save: 'Save and reconnect',
        saving: 'Saving…',
        restart: 'Restart connection',
        restarting: 'Restarting…',
        status: 'Status',
        connected: 'connected',
        connecting: 'connecting',
        waiting: 'waiting for authorization',
        closed: 'closed',
        disabled: 'disabled',
        failed: 'failed',
        unknown: 'unknown',
        authHint: 'The first start opens a browser for Atlassian OAuth consent. Approve it once; the grant is cached in ~/.mcp-auth and refreshed automatically.',
        npxHint: 'Needs npx on the harness PATH.',
        failedSave: 'Could not save',
        saved: 'Saved. The server is reconnecting with the new endpoint.',
        toolsHint: 'Tools appear as mcp__atlassian__* once the server connects.',
      },
      id: {
        title: 'Atlassian Confluence & Jira',
        summary: 'Tool Confluence dan Jira lewat remote MCP server Atlassian.',
        endpoint: 'Endpoint',
        custom: 'URL sendiri',
        customPlaceholder: 'https://…',
        save: 'Simpan dan sambung ulang',
        saving: 'Menyimpan…',
        restart: 'Sambung ulang',
        restarting: 'Menyambung ulang…',
        status: 'Status',
        connected: 'tersambung',
        connecting: 'menyambung',
        waiting: 'menunggu otorisasi',
        closed: 'tertutup',
        disabled: 'nonaktif',
        failed: 'gagal',
        unknown: 'tidak diketahui',
        authHint: 'Saat pertama dijalankan, browser terbuka untuk persetujuan OAuth Atlassian. Setujui sekali; token disimpan di ~/.mcp-auth dan diperbarui otomatis.',
        npxHint: 'Butuh npx di PATH harness.',
        failedSave: 'Gagal menyimpan',
        saved: 'Tersimpan. Server menyambung ulang dengan endpoint baru.',
        toolsHint: 'Tool muncul sebagai mcp__atlassian__* setelah server tersambung.',
      },
    }

    const T = {
      line: 'var(--dsw-alias-border-l1)',
      strong: 'var(--dsw-alias-label-primary)',
      muted: 'var(--dsw-alias-label-secondary)',
      layer: 'var(--dsw-alias-bg-layer-1)',
      layer2: 'var(--dsw-alias-bg-layer-2)',
      ok: 'var(--dsw-alias-state-success-primary)',
      warn: 'var(--dsw-alias-state-warn-primary)',
      error: 'var(--dsw-alias-state-error-primary)',
      brand: 'var(--dsw-alias-brand-primary)',
    }

    const input = {
      width: '100%',
      padding: '5px 9px',
      border: `1px solid ${T.line}`,
      borderRadius: 8,
      background: T.layer2,
      color: T.strong,
      font: 'inherit',
      fontSize: 12,
    }

    const button = (label, onClick, disabled) => h('button', {
      type: 'button',
      onClick,
      disabled,
      style: {
        padding: '4px 10px',
        border: `1px solid ${T.line}`,
        borderRadius: 8,
        background: 'transparent',
        color: T.muted,
        font: 'inherit',
        fontSize: 12,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      },
    }, label)

    // The manager's own vocabulary (dsh-mcp-client connection states).
    const STATES = ['connected', 'connecting', 'waiting-credentials', 'closed', 'disabled', 'failed']
    const tone = state => {
      if (state === 'connected') return T.ok
      if (state === 'failed') return T.error
      if (state === 'waiting-credentials' || state === 'connecting') return T.warn
      return T.muted
    }
    /** Map a manager state onto a localized label; an unknown state is shown verbatim. */
    const stateLabel = (state, tr) => {
      if (!state) return tr('unknown')
      if (state === 'waiting-credentials') return tr('waiting')
      return STATES.includes(state) ? tr(state) : String(state)
    }

    async function read() {
      const res = await fetch('/dsh-atlassian-mcp/config')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json()
    }

    async function write(payload) {
      const res = await fetch('/dsh-atlassian-mcp/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`)
      return data
    }

    function Card({ t }) {
      const tr = key => String(t?.(key) ?? DICT.en[key] ?? key)
      const [state, setState] = useState(null)
      const [preset, setPreset] = useState('')
      const [url, setUrl] = useState('')
      const [busy, setBusy] = useState(false)
      const [note, setNote] = useState('')
      const [error, setError] = useState('')

      useEffect(() => {
        let alive = true
        read()
          .then(data => {
            if (!alive) return
            setState(data)
            setPreset(data.preset)
            setUrl(data.preset === 'custom' ? data.url : '')
          })
          .catch(failure => { if (alive) setError(failure.message) })
        return () => { alive = false }
      }, [])

      const submit = async () => {
        setBusy(true)
        setError('')
        setNote('')
        try {
          const next = await write({ preset, url })
          setState(next)
          setNote(tr('saved'))
        } catch (failure) {
          setError(`${tr('failedSave')}: ${failure.message}`)
        } finally {
          setBusy(false)
        }
      }

      const presets = state?.presets ?? {}
      const statusState = state?.status?.state ?? ''

      return h(
        'div',
        { style: { display: 'grid', gap: 10, fontSize: 12, color: T.strong } },
        h('div', { style: { display: 'grid', gap: 2 } },
          h('strong', { style: { fontSize: 13 } }, tr('title')),
          h('span', { style: { color: T.muted } }, tr('summary'))),
        h(
          'div',
          { style: { display: 'grid', gap: 4 } },
          h('span', { style: { color: T.muted } }, tr('endpoint')),
          ...Object.entries(presets).map(([key, value]) => h(
            'label',
            { key, style: { display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' } },
            h('input', {
              type: 'radio',
              name: 'endpoint',
              checked: preset === key,
              onChange: () => setPreset(key),
            }),
            h('span', null, value.label),
            preset === key ? h('code', { style: { color: T.muted, fontSize: 11, overflowWrap: 'anywhere' } }, value.url) : null,
          )),
          h(
            'label',
            { style: { display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer' } },
            h('input', {
              type: 'radio',
              name: 'endpoint',
              checked: preset === 'custom',
              onChange: () => setPreset('custom'),
            }),
            h('span', null, tr('custom')),
          ),
          preset === 'custom'
            ? h('input', {
                style: input,
                value: url,
                placeholder: tr('customPlaceholder'),
                onChange: event => setUrl(event.target.value),
              })
            : null,
        ),
        h(
          'div',
          { style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
          button(busy ? tr('saving') : tr('save'), submit, busy),
          h('span', { style: { color: tone(statusState) } }, `${tr('status')}: ${stateLabel(statusState, tr)}`),
        ),
        error ? h('span', { style: { color: T.error } }, error) : null,
        note ? h('span', { style: { color: T.ok } }, note) : null,
        h('div', { style: { display: 'grid', gap: 3, color: T.muted, fontSize: 11, lineHeight: 1.5 } },
          h('span', null, tr('authHint')),
          h('span', null, tr('npxHint')),
          h('span', null, tr('toolsHint'))),
      )
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        ctx.effect(
          () => ctx.locale.register(NS, { en: DICT.en, id: DICT.id }),
          'atlassian-mcp: dictionaries',
        )
        ctx.effect(
          () => ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register(
            { name: 'plugins.bundle.config', key: 'dsh-atlassian-mcp', locale: NS },
            ({ t, view }) => (view === 'summary'
              ? h('span', { style: { color: T.muted } }, DICT.en.summary)
              : h(Card, { t })),
          )),
          'atlassian-mcp: config card',
        )
      },
    }
  },
})
