/**
 * Client half: a "WhatsApp" tab in DSH's right Sidebar (the better-sidebar
 * side card). The tab frames the independent local WhatsApp Desk app at
 * http://127.0.0.1:3000 and recovers on its own once that app is running.
 *
 * The host half (lib/index.js) starts the local app when needed; this file
 * only hosts it, so a dashboard crash cannot take the DSH UI with it.
 */
window.__ModuleLoader__.load({
  id: 'dsh-whatsapp-desk',
  factory: (require) => {
    var module = { exports: {} }
    var exports = module.exports
    var React = require('react')
    var BASE = 'http://127.0.0.1:3000/'
    var CHECK_MS = 2500
    var DOWN_AFTER_FAILURES = 8

    var frameStyle = {
      width: '100%',
      height: '100%',
      border: '0',
      display: 'block',
      background: '#f3efe5',
      colorScheme: 'normal',
    }

    var centerStyle = {
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '10px',
      padding: '26px 20px',
      textAlign: 'center',
      font: '13px/1.55 "Segoe UI", system-ui, sans-serif',
      color: 'inherit',
    }

    var buttonStyle = {
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '34px',
      padding: '0 14px',
      border: '0',
      borderRadius: '9px',
      background: '#1fb877',
      color: '#06251b',
      font: '600 12px/1 "Segoe UI", system-ui, sans-serif',
      cursor: 'pointer',
      textDecoration: 'none',
    }

    var quietButtonStyle = {
      ...buttonStyle,
      border: '1px solid rgba(127,127,127,.35)',
      background: 'transparent',
      color: 'inherit',
      fontWeight: '500',
    }

    function WhatsAppMark({ size = 42 }) {
      return React.createElement(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 48 48',
          'aria-hidden': 'true',
          style: { flex: 'none' },
        },
        React.createElement('rect', {
          x: '3',
          y: '3',
          width: '42',
          height: '42',
          rx: '13',
          fill: '#0d2f27',
        }),
        React.createElement('path', {
          d: 'M15.1 35.3 16.4 31A13.3 13.3 0 1 1 21.4 36.5l-6.3 1.2Z',
          fill: '#c9f27b',
        }),
        React.createElement('circle', { cx: '19.2', cy: '24.7', r: '1.8', fill: '#0d2f27' }),
        React.createElement('circle', { cx: '24', cy: '24.7', r: '1.8', fill: '#0d2f27' }),
        React.createElement('circle', { cx: '28.8', cy: '24.7', r: '1.8', fill: '#0d2f27' }),
      )
    }

    function Spinner() {
      return React.createElement(
        'div',
        {
          style: {
            width: '26px',
            height: '26px',
            border: '2px solid rgba(127,127,127,.25)',
            borderTopColor: '#1fb877',
            borderRadius: '50%',
            animation: 'dshWhatsAppSpin .9s linear infinite',
          },
        },
      )
    }

    function StatusStyles() {
      return React.createElement(
        'style',
        null,
        '@keyframes dshWhatsAppSpin{to{transform:rotate(360deg)}}',
      )
    }

    function StartingCard() {
      return React.createElement(
        'div',
        { style: centerStyle },
        React.createElement(StatusStyles),
        React.createElement(WhatsAppMark, { size: 56 }),
        React.createElement(
          'div',
          { style: { fontWeight: 600, fontSize: '14px', marginTop: '4px' } },
          'Starting WhatsApp Desk…',
        ),
        React.createElement(
          'div',
          { style: { opacity: 0.68, maxWidth: '290px' } },
          'The local app is waking up. The tab will connect automatically in a moment.',
        ),
        React.createElement('div', { style: { marginTop: '8px' } }, React.createElement(Spinner)),
      )
    }

    function DownCard({ onRetry }) {
      return React.createElement(
        'div',
        { style: centerStyle },
        React.createElement(WhatsAppMark, { size: 56 }),
        React.createElement(
          'div',
          { style: { fontWeight: 600, fontSize: '14px', marginTop: '4px' } },
          'WhatsApp Desk is not running',
        ),
        React.createElement(
          'div',
          { style: { opacity: 0.7, maxWidth: '320px' } },
          'The local dashboard did not answer. Run start.bat in the WhatsApp Desk folder, or retry below.',
        ),
        React.createElement(
          'code',
          {
            style: {
              maxWidth: '100%',
              padding: '7px 9px',
              borderRadius: '7px',
              border: '1px solid rgba(127,127,127,.25)',
              background: 'rgba(127,127,127,.1)',
              fontFamily: 'Consolas, monospace',
              fontSize: '11px',
              overflowWrap: 'anywhere',
            },
          },
          'start.bat',
        ),
        React.createElement(
          'div',
          { style: { display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center', marginTop: '4px' } },
          React.createElement('button', { type: 'button', style: buttonStyle, onClick: onRetry }, 'Retry'),
          React.createElement(
            'a',
            { href: BASE, target: '_blank', rel: 'noopener noreferrer', style: quietButtonStyle },
            'Open in browser',
          ),
        ),
        React.createElement(
          'div',
          { style: { opacity: 0.5, fontSize: '11px', marginTop: '2px' } },
          'Checks again every few seconds.',
        ),
      )
    }

    function WhatsAppTab() {
      var [phase, setPhase] = React.useState('starting')
      var upRef = React.useRef(false)
      var attemptsRef = React.useRef(0)
      var mountedRef = React.useRef(true)

      var poll = React.useCallback(function () {
        fetch(BASE + 'api/health', { cache: 'no-store' })
          .then(function (response) {
            return response.json().then(function (data) {
              return { ok: response.ok && data && data.ok === true }
            })
          })
          .then(function (result) {
            if (!mountedRef.current) return
            if (result.ok) {
              upRef.current = true
              attemptsRef.current = 0
              setPhase('up')
              return
            }
            attemptsRef.current += 1
            if (!upRef.current && attemptsRef.current >= DOWN_AFTER_FAILURES) setPhase('down')
          })
          .catch(function () {
            // If CORS is blocked by the parent shell, an opaque request still
            // proves the local server is reachable.
            fetch(BASE + 'api/health', { mode: 'no-cors', cache: 'no-store' })
              .then(function () {
                if (!mountedRef.current) return
                upRef.current = true
                attemptsRef.current = 0
                setPhase('up')
              })
              .catch(function () {
                if (!mountedRef.current) return
                attemptsRef.current += 1
                if (!upRef.current && attemptsRef.current >= DOWN_AFTER_FAILURES) setPhase('down')
              })
          })
      }, [])

      React.useEffect(
        function () {
          mountedRef.current = true
          poll()
          var timer = setInterval(poll, CHECK_MS)
          return function () {
            mountedRef.current = false
            clearInterval(timer)
          }
        },
        [poll],
      )

      if (phase === 'up') {
        return React.createElement('iframe', {
          src: BASE,
          title: 'WhatsApp Desk',
          allow: 'clipboard-read; clipboard-write',
          style: frameStyle,
        })
      }

      if (phase === 'down') {
        return React.createElement(DownCard, {
          onRetry: function () {
            attemptsRef.current = 0
            setPhase('starting')
            poll()
          },
        })
      }

      return React.createElement(StartingCard)
    }

    function WhatsAppIcon({ size = 16 }) {
      return React.createElement(
        'svg',
        { width: size, height: size, viewBox: '0 0 24 24', 'aria-hidden': 'true' },
        React.createElement('path', {
          d: 'M12 2.6a9.2 9.2 0 0 0-7.9 13.9L2.8 21l4.7-1.2A9.2 9.2 0 1 0 12 2.6Z',
          fill: 'currentColor',
          opacity: '0.2',
        }),
        React.createElement('path', {
          d: 'M12 4.2a7.6 7.6 0 0 0-6.5 11.5l.2.3-.8 2.7 2.8-.8.3.2A7.6 7.6 0 1 0 12 4.2Z',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: '1.4',
          strokeLinejoin: 'round',
        }),
        React.createElement('circle', { cx: '9.2', cy: '11.8', r: '.9', fill: 'currentColor' }),
        React.createElement('circle', { cx: '12', cy: '11.8', r: '.9', fill: 'currentColor' }),
        React.createElement('circle', { cx: '14.8', cy: '11.8', r: '.9', fill: 'currentColor' }),
      )
    }

    function apply(ctx) {
      var service = ctx && ctx.betterSidebar
      if (!service || typeof service.registerTab !== 'function') {
        console.warn('[dsh-whatsapp-desk] betterSidebar service unavailable; install dsh-better-sidebar.')
        return
      }

      var register = function () {
        return service.registerTab({
          id: 'whatsapp-desk',
          title: 'WhatsApp',
          description: 'Your local WhatsApp chats, contacts and messages',
          order: 41,
          single: true,
          icon: function (size) {
            return React.createElement(WhatsAppIcon, { size: size || 16 })
          },
          component: WhatsAppTab,
        })
      }

      if (typeof ctx.effect === 'function') {
        ctx.effect(register, 'dsh-whatsapp-desk: WhatsApp side-card tab')
      } else {
        register()
      }
    }

    exports.apply = apply
    exports.inject = ['betterSidebar']
    return module.exports
  },
})
