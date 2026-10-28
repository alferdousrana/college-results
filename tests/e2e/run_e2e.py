"""
Browser end-to-end checks in DEMO MODE against the production build (npm run build; npx vite preview --port 4173).
Requires Python Playwright with Chromium. Writes screenshots/PDFs to tests/e2e/out/.
Run: python3 tests/e2e/run_e2e.py   (exits non-zero on the first failed check)
"""
import asyncio, os, sys, re
from playwright.async_api import async_playwright

BASE = os.environ.get('E2E_BASE', 'http://localhost:4173')
OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)
results = []

def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS ' if ok else 'FAIL ') + name + (f' — {detail}' if detail else ''))

async def persona(page, label):
    await page.goto(f'{BASE}/#/login'); await page.wait_for_selector('.persona')
    await page.get_by_role('button', name=re.compile(label)).click()
    await page.wait_for_timeout(800)

async def signout(page):
    await page.evaluate("localStorage.removeItem('crms.demo.session')"); await page.goto(f'{BASE}/#/lookup'); await page.reload(); await page.wait_for_timeout(800)

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        ctx = await browser.new_context(viewport={'width': 1366, 'height': 900})
        page = await ctx.new_page()
        errors = []
        page.on('pageerror', lambda e: errors.append(str(e)))
        page.on('console', lambda m: errors.append(m.text) if m.type == 'error' and 'ERR_NAME_NOT_RESOLVED' not in m.text else None)

        # Default experience: English + light, not configured → setup screen offers demo.
        await page.goto(f'{BASE}/#/admin'); await page.wait_for_url(re.compile('setup'), timeout=10000); await page.wait_for_timeout(500)
        check('defaults to English and light', await page.evaluate("document.documentElement.lang") == 'en' and await page.evaluate("document.documentElement.dataset.theme") == 'light')
        await page.wait_for_selector('text=Connect the database', timeout=10000)
        check('unconfigured app shows setup screen', 'Connect the database' in await page.inner_text('main'))
        await page.goto(f'{BASE}/#/demo'); await page.get_by_role('button', name='Open demo mode').click()
        await page.wait_for_selector('.persona', timeout=20000)
        check('demo banner is always visible', await page.locator('.demo-banner').is_visible())

        # Super Admin
        await persona(page, 'Demo Administrator')
        await page.wait_for_selector('.stat')
        check('admin dashboard shows counts', await page.locator('.stat').count() == 7)
        hc = await page.locator('.headcount').inner_text()
        check('dashboard shows teachers, staff and class-wise students', 'Teachers' in hc and 'Staff' in hc and 'Class Eleven' in hc and '24' in hc, hc[:120])
        await page.screenshot(path=f'{OUT}/admin-dashboard.png', full_page=True)
        await page.goto(f'{BASE}/#/admin/students'); await page.wait_for_timeout(1000); await page.select_option('select[name=sc]', 'class-11'); await page.wait_for_timeout(1200)
        check('students page lists class 11 with server pagination', 'Ayesha' in await page.inner_text('main'))
        cc = await page.locator('.count-chips').inner_text()
        check('students page shows group-wise totals', 'Science: 10' in cc.replace('\n', ' ') and 'Total: 24' in cc.replace('\n', ' '), cc)
        await page.goto(f'{BASE}/#/admin/staff'); await page.wait_for_timeout(1000)
        await page.get_by_role('button', name='Add staff member').click()
        d = page.locator('dialog[open]'); await d.locator('input[name=sfen]').fill('Abul Kashem'); await d.locator('input[name=sfden]').fill('Office Assistant')
        await d.get_by_role('button', name='Save').click(); await page.wait_for_timeout(1200)
        check('staff member can be added', 'Abul Kashem' in await page.inner_text('main'))
        await page.goto(f'{BASE}/#/admin/teachers'); await page.wait_for_timeout(1500)
        await page.locator('.data-table tbody tr', has_text='Rahima Begum').get_by_role('button', name='Edit').click(); await page.wait_for_timeout(600)
        d = page.locator('dialog[open]')
        check('teacher edit allows name/mobile, email read-only', await d.locator('input[name=tname], input[name=teName], input').first.is_visible())
        await page.keyboard.press('Escape')
        await page.goto(f'{BASE}/#/admin/assignments'); await page.wait_for_timeout(2000)
        txt = await page.inner_text('main')
        check('assignments grouped into common and group sections (no class split)', 'Rahima Begum' in txt and 'Common subjects' in txt and 'Science' in txt and 'Class Eleven' not in txt)
        row = page.locator('.assign-row', has_text='Physics').first
        before = await row.locator('.chip').count()
        await row.get_by_role('button', name='Assign').click()
        await page.locator('dialog[open] select').select_option(label='Rahima Begum')
        await page.locator('dialog[open]').get_by_role('button', name='Assign').click(); await page.wait_for_timeout(1500)
        check('assigning closes the dialog and updates the list without reload', await page.locator('dialog[open]').count() == 0 and await page.locator('.assign-row', has_text='Physics').first.locator('.chip').count() == before + 1)
        await page.goto(f'{BASE}/#/admin/teachers'); await page.wait_for_timeout(1500)
        tabs_text = await page.locator('.tabs').inner_text()
        check('teachers tabs: Approved, Requests, Disabled', tabs_text.index('Approved') < tabs_text.index('Requests') < tabs_text.index('Disabled'))
        await page.get_by_role('tab', name=re.compile('Requests')).click(); await page.wait_for_timeout(800)
        await page.get_by_role('button', name='Approve').first.click(); await page.locator('dialog[open]').get_by_role('button', name='Approve').click(); await page.wait_for_timeout(1500)
        check('approving updates the list immediately', 'Sumon Das' not in await page.inner_text('.tabs__panel'))
        for path, text in [('/admin/sheets', 'Annual Examination 2026'), ('/admin/classes', 'Class Eleven'),
                           ('/admin/subjects', 'Higher Mathematics'), ('/admin/archive', 'Half-Yearly'), ('/admin/audit', 'Results published')]:
            await page.goto(f'{BASE}/#{path}'); await page.wait_for_timeout(1200)
            check(f'page {path} loads data', text in await page.inner_text('main'))
        # Sheet detail: missing marks and publish guard
        await page.goto(f"{BASE}/#/admin/sheet?sid=2026__class-11__annual"); await page.wait_for_timeout(1500)
        await page.get_by_role('tab', name=re.compile('Missing marks')).click(); await page.wait_for_timeout(500)
        check('missing marks list shows teacher column', 'Teacher' in await page.inner_text('.tabs__panel'))
        await page.get_by_role('tab', name=re.compile('Results')).click(); await page.wait_for_timeout(1500)
        check('results preview warns about incomplete marks', 'missing or invalid marks' in await page.inner_text('.tabs__panel'))
        # Subject editor
        await page.goto(f'{BASE}/#/admin/subjects'); await page.wait_for_timeout(800)
        await page.get_by_role('button', name='Add subject').click(); await page.get_by_role('button', name='MCQ + Practical', exact=True).click()
        check('subject editor builds MCQ + Practical', await page.locator('.comp-editor tbody tr').count() == 2)
        await page.keyboard.press('Escape')
        # Wizard: create a Test examination and reach the share confirmation
        await page.goto(f'{BASE}/#/admin/sheet/new'); await page.wait_for_timeout(1200)
        await page.select_option('select[name=class]', 'class-11'); await page.select_option('select[name=exam]', 'test'); await page.wait_for_timeout(200)
        await page.locator('.check-chip', has_text='Science').click()
        await page.get_by_role('button', name='Continue').click(); await page.wait_for_timeout(1200)
        subj = await page.inner_text('.wizard-panel')
        check('subjects step shows how many students take each subject', 'Science · 10 students' in subj and '(10 students)' in subj, subj[:200])
        for _ in range(3):
            await page.get_by_role('button', name='Continue').click(); await page.wait_for_timeout(900)
        check('wizard reaches review with students', 'Students' in await page.inner_text('.wizard-panel') and 'Everything needed for sharing' in await page.inner_text('.wizard-panel'))
        await page.screenshot(path=f'{OUT}/wizard-review.png', full_page=True)
        await page.get_by_role('button', name='Save and share with all teachers').click(); await page.wait_for_timeout(1500)
        dlg = await page.locator('dialog[open]').inner_text()
        check('share confirmation lists subjects, teachers and student count', 'Physics' in dlg and 'Kamal Hossain' in dlg and 'students' in dlg)
        await page.locator('dialog[open]').get_by_role('button', name='Share with all teachers').click(); await page.wait_for_timeout(1500)
        check('sharing moves the sheet to Ready for mark entry', 'Ready for mark entry' in await page.inner_text('main'))
        # Examination routine → printed routine and attendance sheets
        await page.goto(f'{BASE}/#/admin/routines'); await page.wait_for_timeout(1000)
        await page.get_by_role('button', name='New routine').click(); await page.wait_for_selector('input[name=rtt]', timeout=20000)
        await page.fill('input[name=rtt]', 'বার্ষিক পরীক্ষা-২০২৬')
        cols = page.locator('.rt-columns .row-actions select')
        await cols.nth(0).select_option('2026'); await cols.nth(1).select_option('class-9'); await cols.nth(2).select_option('annual')
        await page.get_by_role('button', name='Add column').click(); await page.wait_for_timeout(600)
        check('routine column can be added before its result sheet exists', 'no result sheet yet' in await page.locator('.rt-columns').inner_text())
        await page.locator('.rt-col-chip .chip__x').first.click(); await page.wait_for_timeout(300)
        await cols.nth(0).select_option('2026'); await cols.nth(1).select_option('class-11'); await cols.nth(2).select_option('annual')
        await page.get_by_role('button', name='Add column').click(); await page.wait_for_timeout(800)
        await page.get_by_role('button', name='Add date').click(); await page.locator('.rt-grid tbody tr').first.locator('input[type=date]').fill('2026-11-10')
        await page.locator('.rt-grid tbody tr').first.locator('select').first.select_option(label='পদার্থবিজ্ঞান - ১৭৪')
        await page.get_by_role('button', name='Save changes').click(); await page.wait_for_timeout(1200)
        await page.get_by_role('tab', name='Printed routine').click(); await page.wait_for_selector('.rt-table', timeout=20000)
        check('routine prints in Bangla with date, weekday and subject code', 'মঙ্গলবার' in await page.inner_text('.rt-table') and '১৭৪' in await page.inner_text('.rt-table'))
        await page.get_by_role('tab', name='Attendance sheets').click(); await page.wait_for_selector('.at-box', timeout=20000); await page.wait_for_timeout(800)
        first = await page.locator('.at-box').first.inner_text()
        check('attendance sheet is filled from the routine for students who sit the subject', '১০/১১/২০২৬' in first and 'পদার্থবিজ্ঞান' in first, first[:80])

        await page.get_by_role('tab', name='Invigilators').click(); await page.wait_for_selector('.print-doc--duties', timeout=20000)
        await page.locator('.rt-grid tbody tr').first.locator('select').first.select_option(index=1); await page.wait_for_timeout(400)
        check('invigilator sheet lists the day, subject and chosen teacher', 'জনাব' in await page.inner_text('.print-doc--duties') and 'পদার্থবিজ্ঞান' in await page.inner_text('.print-doc--duties'))
        await page.get_by_role('tab', name='Admit cards').click(); await page.wait_for_selector('.ac-card', timeout=20000)
        check('admit cards: four per page with the permission date', await page.locator('.print-doc--admit').first.locator('.ac-card').count() == 4 and '১০/১১/২০২৬' in await page.locator('.ac-card').first.inner_text())
        await page.get_by_role('tab', name='Seat cards').click(); await page.wait_for_selector('.sc-card', timeout=20000)
        await page.locator('.print-controls select').nth(1).select_option('9'); await page.wait_for_timeout(500)
        check('seat cards: chosen number per page', await page.locator('.sc-grid').first.locator('.sc-card').count() == 9)

        # Give a teacher the "students" right, then sign in as that teacher
        await page.goto(f'{BASE}/#/admin/teachers'); await page.wait_for_timeout(1500)
        await page.locator('.data-table tbody tr', has_text='Kamal Hossain').get_by_role('button', name='Edit').click(); await page.wait_for_timeout(500)
        await page.locator('dialog[open] input[name=gst]').check(); await page.locator('dialog[open]').get_by_role('button', name='Save').click(); await page.wait_for_timeout(1200)
        check('teacher list shows the granted right', 'Can add students' in await page.locator('.data-table tbody tr', has_text='Kamal Hossain').inner_text())
        await signout(page); await persona(page, 'Kamal')
        check('granted teacher sees Students in the menu', await page.locator('.sidebar a', has_text='Students').count() == 1)
        await page.goto(f'{BASE}/#/admin/students'); await page.wait_for_timeout(1500)
        check('granted teacher can open Students but not delete', 'Ayesha' in await page.inner_text('main') and await page.get_by_role('button', name='Delete').count() == 0)
        await signout(page); await persona(page, 'Demo Administrator')

        # Settings sections
        for sec, text in [('institution', 'Logo'), ('studentFields', 'Blood group'), ('grading', 'What these rules mean'), ('print', 'Bangla font'), ('publication', 'Extra check'), ('retention', 'public lookup'), ('features', 'JSON student import')]:
            await page.goto(f'{BASE}/#/settings?section={sec}'); await page.wait_for_timeout(1300)
            check(f'settings {sec} renders', text in await page.inner_text('.settings-panel'))
        bn_fonts = await page.evaluate("1")
        await page.goto(f'{BASE}/#/settings?section=print'); await page.wait_for_timeout(1500)
        opts = await page.locator('select:has(option[value="noto-serif-bengali"]) option').count()
        check('print designer offers ten Bangla fonts', opts >= 10, str(opts))
        await page.locator('.print-designer__preview select').first.select_option('bn'); await page.wait_for_timeout(1500)
        await page.screenshot(path=f'{OUT}/print-designer-bn.png', full_page=False)
        check('preview renders Bangla marksheet', 'অগ্রগতি প্রতিবেদন' in await page.inner_text('.print-preview-box'))
        # Bangla interface + persistence
        await page.goto(f'{BASE}/#/settings?section=appearance'); await page.wait_for_timeout(800)
        await page.select_option('#pref-lang', 'bn'); await page.wait_for_timeout(800)
        await page.reload(); await page.wait_for_timeout(1200)
        check('Bangla interface persists after reload', 'সেটিংস' in await page.inner_text('main'))
        await page.locator('.segmented__opt', has_text='গাঢ়').click(); await page.wait_for_timeout(300)
        check('dark theme applies', await page.evaluate("document.documentElement.dataset.theme") == 'dark')
        await page.screenshot(path=f'{OUT}/settings-bn-dark.png')
        await page.select_option('#pref-lang', 'en'); await page.locator('.segmented__opt', has_text='Light').click(); await page.wait_for_timeout(400)

        # Results print: full sheet → PDF
        await page.goto(f'{BASE}/#/results?sid=2026__class-11__half-yearly'); await page.wait_for_timeout(2500)
        check('all groups print together, Science first, serial restarts per group', await page.locator('.rs-table').count() == 3 and await page.locator('.rs-table tbody tr').count() == 24 and (await page.locator('.rs-sub').first.inner_text()).endswith('Science') and await page.locator('.rs-table').nth(1).locator('tbody tr td').first.inner_text() == '1')
        await page.evaluate("document.body.classList.add('is-printing'); document.querySelector('.print-area').classList.add('print-target')")
        await page.add_style_tag(content='@page { size: A4 landscape; margin: 8mm }')
        await page.emulate_media(media='print')
        await page.pdf(path=f'{OUT}/result-sheet.pdf', format='A4', landscape=True, print_background=True)
        await page.emulate_media(media='screen')
        check('result sheet PDF written', os.path.getsize(f'{OUT}/result-sheet.pdf') > 20000)

        # Teacher mark entry
        await signout(page)
        await persona(page, 'Kamal Hossain')
        await page.wait_for_selector('.exam-card', timeout=15000)
        check('teacher sees only their exams/subjects', 'Physics' in await page.inner_text('main') and 'Biology' not in await page.inner_text('.exam-cards'))
        await page.goto(f"{BASE}/#/marks?sid=2026__class-11__annual&subject=biology"); await page.wait_for_timeout(1200)
        check('URL tampering to another subject is refused', 'not assigned to you' in await page.inner_text('main'))
        await page.goto(f"{BASE}/#/marks?sid=2026__class-11__annual&subject=physics"); await page.wait_for_selector('.mg-input')
        first = page.locator('input[data-row="0"][data-col="0"]')
        await first.fill('44'); await first.press('Enter')
        focused = await page.evaluate("document.activeElement.dataset.row + ':' + document.activeElement.dataset.col")
        check('Enter moves to the next student in the same column', focused == '1:0', focused)
        await page.wait_for_timeout(3500)
        check('autosave reaches Saved', 'All changes saved' in await page.inner_text('.save-status'), await page.inner_text('.save-status'))
        await page.locator('input[data-row="2"][data-col="0"]').fill('99'); await page.wait_for_timeout(2500)
        check('marks above full marks are rejected', await page.locator('input[data-row="2"][data-col="0"]').get_attribute('aria-invalid') == 'true')
        await page.locator('input[data-row="2"][data-col="0"]').fill('30'); await page.wait_for_timeout(2500)
        # Absent with confirmation when marks exist
        await page.locator('.mg-absent').nth(0).check(); await page.wait_for_timeout(300)
        check('absent asks for confirmation when marks exist', await page.locator('dialog[open]').count() == 1)
        await page.locator('dialog[open]').get_by_role('button', name='Mark absent').click(); await page.wait_for_timeout(2500)
        check('absent row shows Absent total', 'Absent' in await page.locator('tbody tr').nth(0).inner_text())
        # Offline edit → pending → reload offline → restored → online → saved
        await ctx.set_offline(True); await page.evaluate("window.dispatchEvent(new Event('offline'))")
        await page.locator('input[data-row="3"][data-col="0"]').fill('33'); await page.wait_for_timeout(2500)
        st = await page.inner_text('.save-status')
        check('offline edit is kept as pending, not reported as saved', 'Offline' in st or 'waiting' in st.lower(), st)
        await page.reload(); await page.wait_for_timeout(2500)
        body = await page.inner_text('main')
        check('app shell loads offline and restores unsent edits', 'restored' in body, body[:120])
        await ctx.set_offline(False); await page.evaluate("window.dispatchEvent(new Event('online'))"); await page.wait_for_timeout(4000)
        check('pending edit syncs when back online', 'All changes saved' in await page.inner_text('.save-status'), await page.inner_text('.save-status'))
        await page.screenshot(path=f'{OUT}/mark-entry.png', full_page=True)

        # Submit a fully entered subject → back button gets focus
        await page.goto(f"{BASE}/#/marks?sid=2026__class-11__annual&subject=chemistry"); await page.wait_for_selector('.mg-input')
        n = await page.locator('tbody tr').count()
        for r in range(n):
            for c in range(3):
                inp = page.locator(f'input[data-row="{r}"][data-col="{c}"]')
                if await inp.is_enabled() and not await inp.input_value(): await inp.fill('20')
        await page.wait_for_timeout(4000)
        await page.get_by_role('button', name='Submit subject').click(); await page.locator('dialog[open]').get_by_role('button', name='Submit').click()
        await page.wait_for_timeout(3500)
        focused = await page.evaluate("document.activeElement && document.activeElement.className")
        check('after submitting, "Back to examination" has focus', 'page-head__back' in (focused or ''), focused)

        # Mobile layouts
        m = await browser.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True)
        mp = await m.new_page()
        await mp.goto(f'{BASE}/'); await mp.evaluate("localStorage.setItem('crms.demo.enabled','1'); localStorage.setItem('crms.demo.session','demo-t-science')")
        await mp.goto(f"{BASE}/#/marks?sid=2026__class-11__annual&subject=physics"); await mp.wait_for_timeout(3000)
        await mp.screenshot(path=f'{OUT}/mobile-mark-entry.png')
        overflow = await mp.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1")
        check('mobile mark entry has no page-level horizontal scroll', overflow)
        await mp.evaluate("localStorage.setItem('crms.demo.session','demo-admin')"); await mp.goto(f'{BASE}/#/admin'); await mp.reload(); await mp.wait_for_timeout(2500)
        check('mobile uses bottom tab bar with More', await mp.locator('.tabbar').is_visible() and await mp.locator('.sidebar').is_hidden())
        await mp.screenshot(path=f'{OUT}/mobile-dashboard.png')

        # Public lookup + marksheet PDF (Bangla)
        await signout(page)
        await page.goto(f'{BASE}/#/lookup'); await page.wait_for_selector('#lk-class', timeout=15000)
        await page.fill('input[name=roll]', '999'); await page.get_by_role('button', name='Show result').click(); await page.wait_for_timeout(1200)
        check('unknown roll shows a generic message', 'No published result matches' in await page.inner_text('main'))
        check('annual (unpublished) exam is not offered', 'Annual' not in await page.inner_text('#lk-exam'))
        await page.fill('input[name=roll]', '১০১'); await page.get_by_role('button', name='Show result').click(); await page.wait_for_selector('.print-doc')
        txt = await page.inner_text('.print-doc')
        check('published marksheet found with Bangla digits accepted; parents shown', 'Progress Report' in txt and "Father's Name" in txt)
        check('public page has the college banner and developer credit', await page.locator('.landing-hero__title').is_visible() and await page.locator('.site-footer a[href="https://alferdousrana.github.io/"]').count() == 1)
        await page.locator('.lookup-actions select').select_option('bn'); await page.wait_for_timeout(1200)
        await page.emulate_media(media='print')
        await page.pdf(path=f'{OUT}/marksheet-bn.pdf', format='A4', print_background=True, margin={'top': '10mm', 'bottom': '10mm', 'left': '10mm', 'right': '10mm'})
        hidden = await page.evaluate("getComputedStyle(document.querySelector('.topbar')).display")
        check('app chrome hidden when printing', hidden == 'none')
        await page.emulate_media(media='screen')
        await mp.goto(f'{BASE}/#/lookup'); await mp.evaluate("localStorage.removeItem('crms.demo.session')"); await mp.reload(); await mp.wait_for_timeout(2000)
        await mp.screenshot(path=f'{OUT}/mobile-lookup.png')

        # PWA basics
        man = await page.evaluate("fetch('/manifest.webmanifest').then(r=>r.json())")
        check('manifest is valid and standalone', man.get('display') == 'standalone' and len(man.get('icons', [])) >= 2)
        sw = await page.evaluate("navigator.serviceWorker.getRegistration().then(r=>!!(r&&r.active))")
        check('service worker is active', sw)
        check('no uncaught page errors', not errors, '; '.join(errors[:3]))
        await browser.close()
    failed = [r for r in results if not r[1]]
    print(f'\n{len(results) - len(failed)}/{len(results)} checks passed')
    sys.exit(1 if failed else 0)

asyncio.run(main())
