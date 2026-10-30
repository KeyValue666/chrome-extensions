/**
 * 用本机 Chrome 跑一遍真实交互，作为改动后的回归自检。
 *
 *   pnpm --filter xtab build
 *   cd extensions/xtab/dist && python -m http.server 8124
 *   node tools/ui-check.mjs http://127.0.0.1:8124/index.html
 *
 * 覆盖：Dock 筛选与放大、右键菜单、快捷方式增删、分组新建/隐藏/恢复/删除、
 * 待办与便签图标及其弹窗、刷新后的持久化、Dock 自动隐藏与主题切换。
 */
import { chromium } from 'playwright-core';

const target = process.argv[2] ?? 'http://127.0.0.1:8124/index.html';
const executablePath =
  process.env.XTAB_CHROME ?? 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const browser = await chromium.launch({ executablePath, headless: true });

const results = [];
const check = (name, ok, detail = '') => {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
};
const tiles = (page) => page.locator('.shortcut[data-id]');
// Dock 图标本身不再包含文本（名称在悬停气泡里），改用 aria-label 匹配
const dockItem = (page, name) => page.locator(`.dock-item[aria-label^="${name}"]`);

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text());
});

try {
  await page.goto(target, { waitUntil: 'load' });
  await page.evaluate(() => localStorage.clear());
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);

  check(
    'Dock：未分组/3 个分组/新建（无「全部」）',
    (await page.locator('.dock-item').count()) === 5,
  );
  // 首页（未分组）空着时自动退到第一个有内容的分组，避免首屏空白
  check(
    '默认落在「常用」分组',
    ((await dockItem(page, '常用').getAttribute('class')) ?? '').includes('is-active'),
  );
  check('默认显示组内 2 个快捷方式', (await tiles(page).count()) === 2);

  await dockItem(page, '未分组').click();
  await page.waitForTimeout(350);
  check('未分组首页有 4 个内置应用图标', (await page.locator('.shortcut-app').count()) === 4);
  check('首页空态提示出现', await page.locator('.shortcuts-empty').isVisible());

  // 1. Dock 筛选
  await dockItem(page, '开发').click();
  await page.waitForTimeout(350);
  check('点「开发」只显示组内快捷方式', (await tiles(page).count()) === 1);
  check('网格上方没有「全部 / 新增」标题行', (await page.locator('.shortcuts-head').count()) === 0);

  // 2. 在分组内新增（入口是网格末尾的虚线「添加」图标）
  await page.locator('.shortcut-add').click();
  await page.locator('.dialog input.field-input').first().fill('MDN');
  await page.locator('.dialog input.field-input').nth(1).fill('developer.mozilla.org');
  await page.locator('.dialog .button-primary').click();
  await page.waitForTimeout(400);
  check('新增后组内变为 2 个', (await tiles(page).count()) === 2);
  // 气泡现在挂在 body 上（fixed 定位），悬停后才出现
  await dockItem(page, '开发').hover();
  await page.waitForTimeout(300);
  check(
    'Dock 气泡里的计数同步更新',
    (await page.locator('.dock-tip.is-visible .dock-tip-meta').innerText()) === '2 个',
  );
  await page.mouse.move(720, 500);
  await page.waitForTimeout(200);

  // 3. 悬停不再出现编辑/删除按钮，背景也不是整块白
  const hoverTile = tiles(page).first();
  await hoverTile.hover();
  await page.waitForTimeout(250);
  check('悬停时没有编辑/删除按钮', (await page.locator('.shortcut-action').count()) === 0);
  check(
    '悬停时图标没有整块底纹',
    (await hoverTile.evaluate((node) => getComputedStyle(node).backgroundColor)) ===
      'rgba(0, 0, 0, 0)',
  );
  check(
    '悬停时图标上浮放大',
    await hoverTile.locator('.shortcut-icon').evaluate((node) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return matrix.a > 1.02;
    }),
  );

  // 4. 右键进入 iOS 式抖动编辑模式（不再弹旧式右键菜单）
  await hoverTile.click({ button: 'right' });
  await page.waitForTimeout(300);
  check('右键进入编辑模式', (await page.locator('.shortcut-grid.is-editing').count()) === 1);
  check('图标出现删除与编辑角标', (await hoverTile.locator('.tile-badge').count()) === 2);
  check('编辑条出现在网格上方', await page.locator('.edit-bar').isVisible());
  check(
    '编辑条初始提示多选',
    (await page.locator('.edit-bar-count').innerText()).includes('点图标'),
  );
  // 编辑态点击图标 = 选中，不跳转
  const urlBefore = page.url();
  await hoverTile.click();
  await page.waitForTimeout(150);
  check('编辑模式下点击图标不跳转', page.url() === urlBefore);
  check('点图标变为选中态', (await page.locator('.shortcut.is-selected').count()) === 1);
  check(
    '编辑条显示已选 1 项',
    (await page.locator('.edit-bar-count').innerText()).includes('已选 1'),
  );
  // 点编辑角标能打开编辑弹窗（角标在图标边缘，用合成 click 更稳）
  await page.evaluate(() => {
    document.querySelector('.shortcut[data-id] .tile-badge.is-edit')?.click();
  });
  await page.waitForTimeout(300);
  check(
    '编辑角标打开编辑弹窗',
    await page.locator('.dialog input.field-input').first().isVisible(),
  );
  await page.keyboard.press('Escape'); // 关弹窗
  await page.waitForTimeout(250);
  await page.keyboard.press('Escape'); // 先清空选中
  await page.waitForTimeout(250);
  check(
    'Esc 先清空选中、仍留在编辑模式',
    (await page.locator('.shortcut-grid.is-editing').count()) === 1 &&
      (await page.locator('.shortcut.is-selected').count()) === 0,
  );
  await page.keyboard.press('Escape'); // 再退出编辑模式
  await page.waitForTimeout(250);
  check('再按 Esc 退出编辑模式', (await page.locator('.shortcut-grid.is-editing').count()) === 0);

  // 4b. 搜索引擎选择器：图标网格、选中态、按钮图标跟随
  await page.locator('.search-engine').click();
  await page.waitForTimeout(250);
  check(
    '引擎菜单是 8 个带图标的选项',
    (await page.locator('.engine-option').count()) === 8 &&
      (await page.locator('.engine-option svg.engine-art').count()) === 8,
  );
  await page.locator('.engine-option', { hasText: '百度' }).click();
  await page.waitForTimeout(250);
  check(
    '切换后按钮指向百度',
    ((await page.locator('.search-engine').getAttribute('aria-label')) ?? '').includes('百度'),
  );
  check(
    '百度选项呈选中态',
    (await page.locator('.engine-option', { hasText: '百度' }).getAttribute('aria-selected')) ===
      'true',
  );

  // 4c. 极简模式：工具条没有眼睛按钮，由点击时钟进出
  check(
    '工具条没有极简模式按钮',
    (await page.locator('.toolbar button[aria-label*="极简"]').count()) === 0,
  );
  await page.locator('#clock-button').click();
  await page.waitForTimeout(300);
  check(
    '点击时钟进入极简模式',
    await page.locator('body').evaluate((n) => n.classList.contains('is-minimal')),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check(
    'Esc 退出极简模式',
    await page.locator('body').evaluate((n) => !n.classList.contains('is-minimal')),
  );

  // 5. Dock 放大：悬停中间的分组
  const magnified = dockItem(page, '常用');
  await magnified.hover();
  await page.waitForTimeout(420);
  check(
    'Dock 图标悬停放大',
    await magnified.locator('.dock-tile').evaluate((node) => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(node).transform);
      return matrix.a > 1.1;
    }),
  );
  check(
    'Dock 悬停出现名称气泡',
    await page.locator('.dock-tip.is-visible').evaluate((n) => n.checkVisibility()),
  );

  // 6. 隐藏 / 恢复分组
  await dockItem(page, '娱乐').click({ button: 'right' });
  await page.waitForTimeout(250);
  check(
    '分组右键菜单不压在 Dock 上',
    await page.locator('.popover.is-menu').evaluate((menu) => {
      const box = menu.getBoundingClientRect();
      const dock = document.getElementById('sidebar').getBoundingClientRect();
      return box.left >= dock.right - 1;
    }),
  );
  await page.locator('.popover-item', { hasText: '隐藏分组' }).click();
  await page.waitForTimeout(350);
  check('隐藏后 Dock 里不再有「娱乐」', (await dockItem(page, '娱乐').count()) === 0);
  check('出现「隐藏的分组」入口', (await dockItem(page, '隐藏的分组').count()) === 1);

  await dockItem(page, '隐藏的分组').click();
  await page.waitForTimeout(350);
  await page.locator('.dialog .chip-button').first().click();
  await page.waitForTimeout(300);
  await page.locator('.dialog .button-primary').click();
  await page.waitForTimeout(350);
  check('恢复后「娱乐」回到 Dock', (await dockItem(page, '娱乐').count()) === 1);

  // 7. 新建分组（含图标选择）
  await dockItem(page, '新建分组').click();
  await page.waitForTimeout(350);
  await page.locator('.dialog input.field-input').fill('设计');
  await page.locator('.icon-choice[aria-label="设计"]').click();
  await page.locator('.dialog .button-primary').click();
  await page.waitForTimeout(400);
  check('新分组出现在 Dock', (await dockItem(page, '设计').count()) === 1);
  check('新分组为空，显示空状态', await page.locator('.shortcuts-empty').isVisible());

  // 8. 删除分组
  await dockItem(page, '设计').click({ button: 'right' });
  await page.waitForTimeout(250);
  await page.locator('.popover-item', { hasText: '删除分组' }).click();
  await page.waitForTimeout(300);
  await page.locator('.dialog .button-danger').click();
  await page.waitForTimeout(400);
  check('删除后分组消失', (await dockItem(page, '设计').count()) === 0);
  check(
    '删除后回到「未分组」首页',
    ((await page.locator('.dock-item.is-active').getAttribute('aria-label')) ?? '').includes(
      '未分组',
    ),
  );

  // 9. 待办：从图标打开弹窗
  await page.locator('.shortcut-app-todo').click();
  await page.waitForTimeout(400);
  check('待办图标打开弹窗', await page.locator('.dialog-title', { hasText: '待办' }).isVisible());
  await page.locator('.todo-input').fill('验证弹窗待办');
  await page.locator('.todo-input').press('Enter');
  await page.waitForTimeout(200);
  check('待办能新增', (await page.locator('.todo-item').count()) === 1);
  await page.locator('.todo-text').first().click();
  await page.waitForTimeout(200);
  check('勾选后进入已完成', (await page.locator('.todo-item.is-done').count()) === 1);

  // 再留一条未完成的，验证角标
  await page.locator('.todo-input').fill('第二条待办');
  await page.locator('.todo-input').press('Enter');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(450);
  check('关闭后弹窗移除', (await page.locator('.dialog').count()) === 0);
  check(
    '待办图标角标显示未完成数',
    (await page.locator('.shortcut-app-todo .app-badge').innerText()) === '1',
  );

  // 9b. 右上角工具条：弹窗刚关闭就点，不被 200ms 渐隐遮罩吞掉
  await page.locator('.shortcut-app-note').click();
  await page.waitForTimeout(350);
  await page.keyboard.press('Escape');
  await page.locator('.tool-button[aria-label="设置"]').click({ timeout: 2000 });
  check('弹窗刚关闭就点右上角，设置抽屉能打开', await page.locator('.drawer-backdrop').isVisible());
  // 抽屉开着点「壁纸」按钮 → 切到壁纸分区，抽屉保持打开
  await page.locator('.tool-button[aria-label="壁纸"]').click();
  await page.waitForTimeout(450);
  const wallpaperBox = await page.locator('.drawer-body [data-section="wallpaper"]').boundingBox();
  check(
    '抽屉开着点壁纸按钮 → 切到壁纸分区且抽屉不关',
    (await page.locator('.drawer-backdrop').count()) === 1 &&
      wallpaperBox !== null &&
      wallpaperBox.y < 200,
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 10. 便签：输入后重开仍在
  await page.locator('.shortcut-app-note').click();
  await page.waitForTimeout(400);
  await page.locator('.note-area').fill('回归测试写下的便签');
  await page.waitForTimeout(700);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.locator('.shortcut-app-note').click();
  await page.waitForTimeout(400);
  check('便签内容能持久', (await page.locator('.note-area').inputValue()) === '回归测试写下的便签');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(350);

  // 11. 刷新后仍然保持（首页空着时自动落到有内容的分组）
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(800);
  check(
    '刷新后默认落在「常用」',
    ((await page.locator('.dock-item.is-active').getAttribute('aria-label')) ?? '').includes(
      '常用',
    ),
  );
  check('刷新后快捷方式保留', (await tiles(page).count()) === 2);
  await dockItem(page, '未分组').click();
  await page.waitForTimeout(350);
  check(
    '刷新后待办角标保留',
    (await page.locator('.shortcut-app-todo .app-badge').innerText()) === '1',
  );
  await dockItem(page, '开发').click();
  await page.waitForTimeout(350);
  check('刷新后新增的快捷方式保留', (await tiles(page).count()) === 2);

  // 11b. 拖拽合并成文件夹（合成 DragEvent 触发 HTML5 拖拽链路）
  const looseBefore = await tiles(page).count();
  const mergeDrag = async (srcTitle, dstSelector) => {
    await page.evaluate(
      ([srcT, dstSel]) => {
        const tiles = [...document.querySelectorAll('.shortcut[data-id]')];
        const src = tiles.find((t) => t.querySelector('.shortcut-title')?.textContent === srcT);
        const dst = document.querySelector(dstSel);
        if (!src || !dst) throw new Error('merge target missing');
        const dt = new DataTransfer();
        src.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        const r = dst.getBoundingClientRect();
        const cx = r.x + r.width / 2;
        const cy = r.y + r.height / 2;
        dst.dispatchEvent(
          new DragEvent('dragover', { bubbles: true, dataTransfer: dt, clientX: cx, clientY: cy }),
        );
        window.__merge = { dt, src, dst, cx, cy };
      },
      [srcTitle, dstSelector],
    );
    await page.waitForTimeout(450); // > 320ms dwell，进入合并预览
    await page.evaluate(() => {
      const { dt, src, dst, cx, cy } = window.__merge;
      dst.dispatchEvent(
        new DragEvent('drop', { bubbles: true, dataTransfer: dt, clientX: cx, clientY: cy }),
      );
      src.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      delete window.__merge;
    });
    await page.waitForTimeout(400);
  };

  await mergeDrag('MDN', '.shortcut[data-id]'); // 拖「MDN」到第一个图标（GitHub）
  check('合并后组内松散项消失', (await tiles(page).count()) === looseBefore - 2);
  check('合并后自动打开文件夹弹窗', await page.locator('.folder-grid').isVisible());
  await page.keyboard.press('Escape'); // 关闭文件夹弹窗
  await page.waitForTimeout(300);

  // 文件夹统一在「未分组」首页展示
  await dockItem(page, '未分组').click();
  await page.waitForTimeout(350);
  check('拖放重叠生成文件夹', (await page.locator('.shortcut-folder').count()) === 1);
  await page.locator('.shortcut-folder').click();
  await page.waitForTimeout(350);
  check('文件夹里有 2 个成员', (await page.locator('.folder-item').count()) === 2);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  // 11c. 在首页加一个未分组图标，拖到文件夹上 → 并入
  await page.locator('.shortcut-add').click();
  await page.locator('.dialog input.field-input').first().fill('测试站');
  await page.locator('.dialog input.field-input').nth(1).fill('example.com');
  await page.locator('.dialog .button-primary').click();
  await page.waitForTimeout(400);
  await mergeDrag('测试站', '.shortcut-folder');
  await page.locator('.shortcut-folder').click();
  await page.waitForTimeout(350);
  check('并入后文件夹有 3 个成员', (await page.locator('.folder-item').count()) === 3);

  // 11d. 在文件夹里逐个移出，剩 1 个时自动解散
  const firstItem = page.locator('.folder-item').first();
  await firstItem.hover();
  await page.waitForTimeout(150);
  await firstItem.locator('.folder-pop').click();
  await page.waitForTimeout(300);
  check('移出后剩 2 个成员', (await page.locator('.folder-item').count()) === 2);
  const secondItem = page.locator('.folder-item').first();
  await secondItem.hover();
  await page.waitForTimeout(150);
  await secondItem.locator('.folder-pop').click();
  await page.waitForTimeout(400);
  check('剩 1 个时文件夹自动解散', (await page.locator('.shortcut-folder').count()) === 0);
  check('解散后成员回到首页网格', (await tiles(page).count()) === 1);
  await dockItem(page, '开发').click();
  await page.waitForTimeout(350);
  check('分组里的成员也回到网格', (await tiles(page).count()) === 2);

  // 12. 自动隐藏 Dock 并持久化
  await page.getByRole('button', { name: '设置' }).click();
  await page.waitForTimeout(500);
  await page.getByRole('switch', { name: '自动隐藏 Dock' }).click();
  await page.waitForTimeout(300);
  check(
    '开启后 Dock 自动隐藏',
    await page.locator('body').evaluate((n) => n.classList.contains('is-dock-autohide')),
  );
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  check(
    '自动隐藏状态持久化',
    await page.locator('body').evaluate((n) => n.classList.contains('is-dock-autohide')),
  );

  // 贴着左边缘能唤出
  await page.mouse.move(4, 400);
  await page.waitForTimeout(350);
  check(
    '贴边唤出 Dock',
    await page.locator('#sidebar').evaluate((n) => n.classList.contains('is-peek')),
  );

  // 12b. 唤出后移上 Dock，再挪回左边缘：不能在指针底下把 Dock 收走
  await page.mouse.move(40, 400);
  await page.waitForTimeout(200);
  await page.mouse.move(6, 400);
  await page.waitForTimeout(900);
  check(
    '指针停在左边缘时 Dock 保持展开',
    await page.locator('#sidebar').evaluate((n) => n.classList.contains('is-peek')),
  );

  // 12c. 再次悬停（从边缘移回 Dock）后图标仍然可点击
  await dockItem(page, '开发').click();
  await page.waitForTimeout(350);
  check('再次悬停后 Dock 图标可点击', (await tiles(page).count()) === 2);

  // 12d. 真正离开（离开 Dock 也离开感应条）后才收回
  await page.mouse.move(600, 400);
  await page.waitForTimeout(1100);
  check(
    '离开后 Dock 自动收回',
    await page.locator('#sidebar').evaluate((n) => !n.classList.contains('is-peek')),
  );

  // 13. 主题切换并持久化
  await page.getByRole('button', { name: '设置' }).click();
  await page.waitForTimeout(500);
  await page.locator('.segment', { hasText: '浅色' }).click();
  await page.waitForTimeout(300);
  check('切到浅色主题', (await page.locator('html').getAttribute('data-theme')) === 'light');
  check(
    '浅色 segment 呈选中态',
    (await page.locator('.segment', { hasText: '浅色' }).getAttribute('aria-pressed')) === 'true',
  );
  check(
    '跟随系统取消选中',
    (await page.locator('.segment', { hasText: '跟随系统' }).getAttribute('aria-pressed')) ===
      'false',
  );
  await page.locator('.segment', { hasText: '深色' }).click();
  await page.waitForTimeout(300);
  check('切到深色主题', (await page.locator('html').getAttribute('data-theme')) === 'dark');
  check(
    '深色 segment 呈选中态',
    (await page.locator('.segment', { hasText: '深色' }).getAttribute('aria-pressed')) === 'true',
  );
  await page.locator('.segment', { hasText: '浅色' }).click();
  await page.waitForTimeout(300);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: 'load' });
  await page.waitForTimeout(700);
  check('主题持久化', (await page.locator('html').getAttribute('data-theme')) === 'light');
  check(
    '搜索引擎持久化',
    ((await page.locator('.search-engine').getAttribute('aria-label')) ?? '').includes('百度'),
  );

  // 14. 扩展图标弹出面板：模拟 chrome.tabs 返回当前页，走一遍「收藏当前网页」
  //     （无扩展环境的 http 预览页里 storage 走 localStorage 回退，与主页面同源同库）
  const popupPage = await context.newPage();
  popupPage.on('pageerror', (error) => errors.push(`popup: ${error.message}`));
  popupPage.on('console', (message) => {
    if (message.type() === 'error') errors.push(`popup: ${message.text()}`);
  });
  await popupPage.addInitScript(() => {
    window.chrome = {
      tabs: {
        query: async () => [
          {
            url: 'https://developer.mozilla.org/zh-CN/docs/Web/API',
            title: 'Web API 接口参考 | MDN',
          },
        ],
      },
    };
  });
  await popupPage.goto(`${target.replace(/index\.html.*$/, '')}popup.html`, { waitUntil: 'load' });
  await popupPage.waitForTimeout(600);
  check(
    '面板自动带出当前页标题与网址',
    (await popupPage.locator('.field-title').inputValue()) === 'Web API 接口参考 | MDN' &&
      (await popupPage.locator('.field-url').inputValue()) ===
        'https://developer.mozilla.org/zh-CN/docs/Web/API',
  );
  check('面板列出未分组与全部分组', (await popupPage.locator('.chip').count()) >= 2);
  await popupPage.locator('.btn-primary').first().click();
  await popupPage.waitForTimeout(500);
  check('添加后面板进入成功态', (await popupPage.locator('.done-text').count()) === 1);
  const popupSaved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem('xtab:state:v1')).shortcuts.some(
      (item) => item.url === 'https://developer.mozilla.org/zh-CN/docs/Web/API',
    ),
  );
  check('面板添加的快捷方式写入同一份存储', popupSaved === true);
  // 再开一次面板：同网址判重
  await popupPage.reload({ waitUntil: 'load' });
  await popupPage.waitForTimeout(600);
  check(
    '再收藏同一页提示已存在',
    ((await popupPage.locator('.notice').first().innerText()) ?? '').includes('已在'),
  );
  await popupPage.close();

  check('无 console / 页面报错', errors.length === 0, errors.join(' | '));
} catch (error) {
  results.push(`FAIL  脚本中断 — ${error instanceof Error ? error.message.split('\n')[0] : error}`);
} finally {
  for (const line of results) console.log(line);
  console.log(
    `\n${results.filter((line) => line.startsWith('PASS')).length} passed, ${results.filter((line) => line.startsWith('FAIL')).length} failed`,
  );
  await context.close();
  await browser.close();
}
