import { escapeHtml } from './escape-html'

describe('escapeHtml', () => {
  it('escapes & < > " and apostrophes', () => {
    expect(escapeHtml('<b>"O\'Neil" & co</b>')).toBe(
      '&lt;b&gt;&quot;O&#39;Neil&quot; &amp; co&lt;/b&gt;',
    )
  })
})
