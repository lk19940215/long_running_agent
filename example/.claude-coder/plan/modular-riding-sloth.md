# 双11抢购活动页开发技术方案

## 一、项目背景

基于现有项目 `E:\Code\claude-coder\example`（React 18 + TypeScript + Vite + Tailwind CSS），开发一个双11抢购活动页面，用于移动端营销推广。页面需包含轮播展示、微信分享、海报生成等核心功能。

## 二、技术选型

### 2.1 核心技术栈（复用现有）
- **框架**: React 18.2.0 + TypeScript
- **路由**: React Router DOM v6.22.0
- **构建工具**: Vite v5.0.0
- **CSS**: Tailwind CSS v3.4.0 + 自定义CSS变量（深色主题）

### 2.2 新增依赖
| 包名 | 用途 | 版本建议 |
|------|------|----------|
| `swiper` | 轮播组件库（支持触摸、懒加载、自动播放） | ^11.0.0 |
| `html2canvas` | DOM转图片，用于海报生成 | ^1.4.1 |
| `weixin-js-sdk` | 微信JS-SDK，支持微信分享 | ^1.6.0 |
| `@types/weixin-js-sdk` | 微信JS-SDK类型定义 | ^1.4.5 |

**选型理由**:
- **Swiper**: 轻量级、功能强大、触摸优化，支持懒加载和自动播放，符合轮播需求
- **html2canvas**: 成熟稳定的DOM转图片方案，兼容性好，易于集成
- **weixin-js-sdk**: 官方微信SDK，确保分享功能稳定可靠

## 三、项目结构设计

### 3.1 新增目录结构
```
src/
├── pages/
│   └── ActivityPage/              # 新增：双11活动页
│       ├── index.tsx              # 活动页主组件
│       └── ActivityPage.css       # 活动页样式（可选）
├── components/
│   ├── activity/                  # 新增：活动相关组件
│   │   ├── SwiperCarousel/        # 轮播组件
│   │   │   ├── index.tsx
│   │   │   ├── SwiperCarousel.css
│   │   │   └── types.ts           # TypeScript类型定义
│   │   └── ShareButton/           # 分享组件
│   │       ├── index.tsx
│   │       ├── ShareButton.css
│   │       └── types.ts
│   └── common/
│       └── Loading/               # 新增：加载组件（海报生成时使用）
│           └── index.tsx
└── utils/
    ├── share/                     # 新增：分享工具
    │   ├── wechat.ts              # 微信分享配置
    │   ├── poster.ts              # 海报生成工具
    │   └── shareStats.ts          # 分享统计埋点
    └── mobile.ts                  # 新增：移动端工具（适配、检测）
```

### 3.2 文件清单

#### 路由相关
- `src/router/index.tsx` - 添加活动页路由（需要修改）

#### 页面组件
- `src/pages/ActivityPage/index.tsx` - 活动页主组件

#### 轮播组件
- `src/components/activity/SwiperCarousel/index.tsx` - 轮播组件
- `src/components/activity/SwiperCarousel/types.ts` - 轮播组件类型定义

#### 分享组件
- `src/components/activity/ShareButton/index.tsx` - 分享按钮组件
- `src/components/activity/ShareButton/types.ts` - 分享组件类型定义

#### 工具函数
- `src/utils/share/wechat.ts` - 微信分享配置和初始化
- `src/utils/share/poster.ts` - 海报生成逻辑（html2canvas封装）
- `src/utils/share/shareStats.ts` - 分享统计埋点工具
- `src/utils/mobile.ts` - 移动端适配工具（设备检测、尺寸计算）

#### 类型定义
- `src/types/activity.ts` - 活动相关类型定义

## 四、组件设计

### 4.1 轮播组件（SwiperCarousel）

#### Props接口
```typescript
// src/components/activity/SwiperCarousel/types.ts
export interface SwiperCarouselProps {
  /** 轮播图片列表 */
  images: Array<{
    src: string;
    alt?: string;
    link?: string; // 点击跳转链接
  }>;
  /** 自动播放间隔（毫秒） */
  autoplayInterval?: number;
  /** 是否启用懒加载 */
  lazy?: boolean;
  /** 轮播高度（支持px、rem、vh等单位） */
  height?: string;
  /** 触摸滑动时的回调 */
  onSlideChange?: (index: number) => void;
}
```

#### 功能实现
1. **自动播放**: 使用Swiper的autoplay配置，间隔3000ms
2. **触摸暂停**: 监听`onTouchStart`和`onTouchEnd`事件
3. **懒加载**: 使用Swiper内置的lazy模式
4. **指示器**: Swiper自带pagination配置
5. **响应式**: 轮播宽度100%，高度支持动态配置

#### 样式要点
- 使用Tailwind CSS类进行样式定义
- 图片保持16:9比例
- 指示器绝对定位在底部居中
- 支持深色主题（复用现有CSS变量）

### 4.2 分享组件（ShareButton）

#### Props接口
```typescript
// src/components/activity/ShareButton/types.ts
export interface ShareConfig {
  title: string;           // 分享标题
  description: string;     // 分享描述
  imageUrl: string;        // 分享缩略图
  link: string;            // 分享链接（当前页面URL）
}

export interface ShareButtonProps {
  config: ShareConfig;
  onShareSuccess?: () => void;  // 分享成功回调
  onShareFail?: (error: Error) => void; // 分享失败回调
}
```

#### 功能实现
1. **微信分享**:
   - 引入weixin-js-sdk
   - 调用后端接口获取签名（需要对接）
   - 配置分享信息（title、desc、link、imgUrl）
   - 监听分享成功事件

2. **海报生成**:
   - 使用html2canvas将DOM转为图片
   - 海报内容包括：活动标题、活动图片、二维码（活动链接）
   - 提供下载功能（转为blob并触发下载）

3. **兜底方案**:
   - 检测`navigator.share`是否存在
   - 存在则使用Web Share API
   - 不存在则提示用户手动分享

#### 分享海报内容结构
```html
<div id="poster-content">
  <div className="poster-header">双11抢购活动</div>
  <div className="poster-image">{轮播第一张图}</div>
  <div className="poster-info">
    <div>活动时间：2026-11-11 00:00</div>
    <div>扫码参与活动</div>
    <canvas id="qrcode-canvas"></canvas> <!-- 二维码 -->
  </div>
</div>
```

### 4.3 活动页主组件（ActivityPage）

#### 组件结构
```tsx
const ActivityPage: React.FC = () => {
  const [shareConfig, setShareConfig] = useState<ShareConfig>();
  const [isWechat, setIsWechat] = useState(false);

  // 初始化微信分享
  useEffect(() => {
    // 检测是否为微信环境
    const ua = navigator.userAgent.toLowerCase();
    setIsWechat(ua.includes('micromessenger'));

    // 配置分享信息
    const config: ShareConfig = {
      title: '双11抢购活动',
      description: '超值优惠，限时抢购！',
      imageUrl: '/activity/poster.jpg',
      link: window.location.href,
    };
    setShareConfig(config);

    // 初始化微信分享（如果是微信环境）
    if (isWechat && config) {
      initWechatShare(config);
    }
  }, []);

  return (
    <div className="activity-page min-h-screen bg-[var(--bg-100)]">
      {/* 顶部轮播 */}
      <div className="swiper-container">
        <SwiperCarousel
          images={activityImages}
          autoplayInterval={3000}
          lazy={true}
          height="40vh"
        />
      </div>

      {/* 活动内容区域 - 根据实际需求扩展 */}
      <div className="activity-content px-4 py-6">
        {/* 这里可以添加活动规则、商品列表等 */}
      </div>

      {/* 底部分享区域 */}
      <div className="share-footer fixed bottom-0 left-0 right-0 bg-white p-4 shadow-lg">
        <ShareButton
          config={shareConfig!}
          onShareSuccess={() => trackShare()}
        />
      </div>
    </div>
  );
};
```

## 五、工具函数设计

### 5.1 微信分享工具（src/utils/share/wechat.ts）

```typescript
import wx from 'weixin-js-sdk';
import type { ShareConfig } from '@/components/activity/ShareButton/types';

// 获取微信签名（需要对接后端）
export const getWechatSignature = async (url: string) => {
  const response = await fetch('/api/wechat/signature', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url }),
  });
  return await response.json();
};

// 初始化微信分享
export const initWechatShare = async (config: ShareConfig) => {
  try {
    const signature = await getWechatSignature(window.location.href);

    wx.config({
      appId: signature.appId,
      timestamp: signature.timestamp,
      nonceStr: signature.nonceStr,
      signature: signature.signature,
      jsApiList: ['updateAppMessageShareData', 'updateTimelineShareData'],
    });

    wx.ready(() => {
      // 分享给朋友
      wx.updateAppMessageShareData({
        title: config.title,
        desc: config.description,
        link: config.link,
        imgUrl: config.imageUrl,
        success: () => {
          console.log('分享给朋友成功');
        },
      });

      // 分享到朋友圈
      wx.updateTimelineShareData({
        title: config.title,
        link: config.link,
        imgUrl: config.imageUrl,
        success: () => {
          console.log('分享到朋友圈成功');
        },
      });
    });

    wx.error((error: any) => {
      console.error('微信分享配置失败:', error);
    });
  } catch (error) {
    console.error('初始化微信分享失败:', error);
  }
};
```

### 5.2 海报生成工具（src/utils/share/poster.ts）

```typescript
import html2canvas from 'html2canvas';

interface PosterOptions {
  title: string;
  description?: string;
  imageUrl?: string;
  qrCodeUrl?: string;
}

export const generatePoster = async (options: PosterOptions): Promise<string> => {
  // 创建海报DOM
  const posterEl = document.createElement('div');
  posterEl.style.width = '750px';
  posterEl.style.height = '1334px';
  posterEl.style.background = 'white';
  posterEl.style.padding = '40px';
  posterEl.style.boxSizing = 'border-box';

  // 添加标题
  const titleEl = document.createElement('h1');
  titleEl.style.fontSize = '48px';
  titleEl.style.color = '#333';
  titleEl.style.marginBottom = '30px';
  titleEl.textContent = options.title;
  posterEl.appendChild(titleEl);

  // 添加描述
  if (options.description) {
    const descEl = document.createElement('p');
    descEl.style.fontSize = '32px';
    descEl.style.color = '#666';
    descEl.style.marginBottom = '40px';
    descEl.textContent = options.description;
    posterEl.appendChild(descEl);
  }

  // 添加图片
  if (options.imageUrl) {
    const imgEl = document.createElement('img');
    imgEl.src = options.imageUrl;
    imgEl.style.width = '670px';
    imgEl.style.height = '400px';
    imgEl.style.objectFit = 'cover';
    imgEl.style.marginBottom = '40px';
    posterEl.appendChild(imgEl);
  }

  // 添加二维码
  if (options.qrCodeUrl) {
    const qrEl = document.createElement('img');
    qrEl.src = options.qrCodeUrl;
    qrEl.style.width = '200px';
    qrEl.style.height = '200px';
    qrEl.style.marginTop = '60px';
    qrEl.style.display = 'block';
    qrEl.style.marginLeft = 'auto';
    qrEl.style.marginRight = 'auto';
    posterEl.appendChild(qrEl);
  }

  document.body.appendChild(posterEl);

  // 生成图片
  const canvas = await html2canvas(posterEl, {
    scale: 2,
    useCORS: true,
    logging: false,
  });

  // 移除临时DOM
  document.body.removeChild(posterEl);

  // 转为data URL
  return canvas.toDataURL('image/png');
};

// 下载海报
export const downloadPoster = (dataUrl: string, filename: string = 'activity-poster.png') => {
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};
```

### 5.3 埋点统计工具（src/utils/share/shareStats.ts）

```typescript
interface ShareStatsData {
  page: string;           // 页面标识
  shareType: 'wechat' | 'poster' | 'web'; // 分享类型
  timestamp: number;      // 时间戳
  userAgent: string;      // 用户代理
}

export const trackShare = async (shareType: ShareStatsData['shareType']) => {
  const data: ShareStatsData = {
    page: 'activity-page',
    shareType,
    timestamp: Date.now(),
    userAgent: navigator.userAgent,
  };

  try {
    await fetch('/api/share-stats', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    console.log('分享统计上报成功');
  } catch (error) {
    console.error('分享统计上报失败:', error);
  }
};
```

### 5.4 移动端适配工具（src/utils/mobile.ts）

```typescript
// 检测是否为移动端
export const isMobile = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
};

// 获取屏幕尺寸
export const getScreenSize = () => {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
  };
};

// 设置viewport（可选：动态调整）
export const setViewport = () => {
  const meta = document.querySelector('meta[name="viewport"]');
  if (!meta) {
    const newMeta = document.createElement('meta');
    newMeta.name = 'viewport';
    newMeta.content = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';
    document.head.appendChild(newMeta);
  }
};

// rem适配（根据设计稿宽度）
export const setRem = (designWidth: number = 750) => {
  const scale = document.documentElement.clientWidth / designWidth;
  document.documentElement.style.fontSize = `${scale * 100}px`;
};

// 防止页面滚动（海报生成时使用）
export const preventScroll = (prevent: boolean) => {
  if (prevent) {
    document.body.style.overflow = 'hidden';
  } else {
    document.body.style.overflow = '';
  }
};
```

## 六、路由配置

### 修改 `src/router/index.tsx`
```typescript
import { createHashRouter } from 'react-router-dom';
import ActivityPage from '@/pages/ActivityPage';

// 添加活动页路由
const router = createHashRouter([
  // ... 现有路由
  {
    path: '/activity',
    element: <ActivityPage />,
  },
]);
```

## 七、样式设计

### 7.1 活动页全局样式（在现有CSS基础上扩展）

#### Viewport配置（已在index.html中）
```html
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
```

#### 深色主题适配
复用现有CSS变量：
- `--bg-100`: 背景色
- `--text-50`: 文字颜色
- `--gradient-start`, `--gradient-end`: 渐变色

#### 按钮尺寸规范
- 最小触摸区域：44px × 44px
- 使用Tailwind的`p-4`或自定义尺寸确保可点击性

#### 字体大小
- 标题：18px-24px
- 正文：14px-16px
- 辅助文字：12px-14px

### 7.2 关键样式要点
1. **轮播容器**: `width: 100%`, `height: 40vh`（响应式高度）
2. **图片比例**: 使用`aspect-video`保持16:9
3. **按钮样式**: 复用现有`btn-primary`类
4. **底部固定**: 使用`fixed bottom-0`定位
5. **滚动优化**: 使用`-webkit-overflow-scrolling: touch`优化iOS滚动

## 八、性能优化

### 8.1 图片优化
1. **懒加载**: Swiper内置支持，或使用`<img loading="lazy">`
2. **图片压缩**: 使用TinyPNG等工具压缩活动图片
3. **响应式图片**: 提供不同尺寸的图片源
4. **CDN加速**: 活动图片部署到CDN

### 8.2 代码优化
1. **组件懒加载**: 使用React.lazy + Suspense
2. **代码分割**: 活动页独立打包
3. **Tree Shaking**: 确保未使用代码被移除
4. **按需引入**: Swiper只引入需要的模块

### 8.3 渲染优化
1. **防抖处理**: 触摸事件使用防抖
2. **虚拟滚动**: 如有长列表，使用虚拟滚动
3. **避免重绘**: 使用transform代替top/left
4. **节流滚动**: 滚动事件使用节流

## 九、安全性和兼容性

### 9.1 安全性
1. **分享链接防刷**:
   - 添加token验证
   - 限制分享频率
   - 记录用户行为

2. **XSS防护**:
   - 对用户输入进行转义
   - 使用DOMPurify等库清理HTML

3. **CORS配置**:
   - 后端配置允许的源
   - 使用HTTPS

### 9.2 浏览器兼容性
| 浏览器 | 版本要求 | 备注 |
|--------|----------|------|
| Chrome | ≥ 90 | 完全支持 |
| Safari | ≥ 14 | iOS 14+ |
| 微信浏览器 | 最新版 | 使用JS-SDK |
| Firefox | ≥ 88 | 完全支持 |
| Edge | ≥ 90 | 完全支持 |

### 9.3 兜底方案
1. **微信分享失败**: 提示用户手动分享或使用海报
2. **html2canvas失败**: 提供备用海报下载链接
3. **触摸滑动失败**: 提供左右箭头按钮
4. **网络请求失败**: 优雅降级，显示错误提示

## 十、测试方案

### 10.1 单元测试
使用Jest + React Testing Library测试组件逻辑

#### 轮播组件测试
```typescript
// SwiperCarousel.test.tsx
describe('SwiperCarousel', () => {
  it('should render with correct number of images', () => {
    const images = [{ src: 'img1.jpg' }, { src: 'img2.jpg' }];
    render(<SwiperCarousel images={images} />);
    expect(screen.getAllByRole('img')).toHaveLength(2);
  });

  it('should autoplay with correct interval', () => {
    // 测试自动播放逻辑
  });
});
```

#### 分享组件测试
```typescript
// ShareButton.test.tsx
describe('ShareButton', () => {
  it('should call onShareSuccess when shared successfully', () => {
    const mockSuccess = jest.fn();
    render(<ShareButton config={mockConfig} onShareSuccess={mockSuccess} />);
    // 模拟分享成功
    expect(mockSuccess).toHaveBeenCalled();
  });
});
```

### 10.2 E2E测试（Playwright）

#### 测试脚本（tests/activity.spec.ts）
```typescript
import { test, expect } from '@playwright/test';

test.describe('Activity Page E2E Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:5173/#/activity');
  });

  // 测试1: 页面加载
  test('should load activity page', async ({ page }) => {
    await expect(page).toHaveTitle(/双11/);
  });

  // 测试2: 轮播组件存在
  test('should display swiper carousel', async ({ page }) => {
    const swiper = page.locator('.swiper-container');
    await expect(swiper).toBeVisible();
  });

  // 测试3: 轮播自动播放
  test('should autoplay carousel', async ({ page }) => {
    const swiper = page.locator('.swiper-container');
    // 等待3秒，验证轮播切换
    await page.waitForTimeout(3100);
    // 验证指示器变化
  });

  // 测试4: 触摸滑动
  test('should swipe carousel on touch', async ({ page }) => {
    const swiper = page.locator('.swiper-container');
    await swiper.swipe({ direction: 'left' });
    // 验证切换到下一张
  });

  // 测试5: 分享按钮存在
  test('should display share button', async ({ page }) => {
    const shareBtn = page.locator('button:has-text("分享")');
    await expect(shareBtn).toBeVisible();
  });

  // 测试6: 海报生成功能
  test('should generate poster', async ({ page }) => {
    const generateBtn = page.locator('button:has-text("生成海报")');
    await generateBtn.click();
    // 验证海报弹窗出现
    const posterModal = page.locator('.poster-modal');
    await expect(posterModal).toBeVisible();
  });

  // 测试7: 移动端适配
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 }); // iPhone 12
    await page.reload();
    const swiper = page.locator('.swiper-container');
    await expect(swiper).toBeVisible();
  });
});
```

#### 运行测试命令
```bash
# 安装Playwright（如果未安装）
npm install -D @playwright/test

# 运行测试
npx playwright test tests/activity.spec.ts --project=iphone12

# 生成测试报告
npx playwright show-report
```

### 10.3 手动测试清单

#### 功能测试
- [ ] 轮播自动播放（3秒/张）
- [ ] 触摸滑动切换
- [ ] 指示器显示正确
- [ ] 图片懒加载生效
- [ ] 分享按钮点击响应
- [ ] 微信分享成功
- [ ] 海报生成成功
- [ ] 海报下载成功
- [ ] 埋点上报成功

#### 兼容性测试
- [ ] iOS Safari（最新版）
- [ ] iOS 微信浏览器
- [ ] Android Chrome（最新版）
- [ ] Android 微信浏览器
- [ ] 桌面Chrome
- [ ] 桌面Safari

#### 性能测试
- [ ] 首屏加载时间 < 2秒
- [ ] 轮播切换流畅（60fps）
- [ ] 海报生成时间 < 3秒
- [ ] 无内存泄漏
- [ ] 无控制台错误

#### 安全性测试
- [ ] 分享链接token验证
- [ ] 无XSS漏洞
- [ ] 无CORS错误
- [ ] 图片加载安全（HTTPS）

## 十一、部署和发布

### 11.1 构建命令
```bash
# 开发环境
npm run dev

# 生产构建
npm run build

# 预览构建结果
npm run preview
```

### 11.2 部署配置
修改 `vite.config.ts`:
```typescript
export default defineConfig({
  // ... 现有配置
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      // 代码分割优化
      output: {
        manualChunks: {
          'swiper': ['swiper'],
          'html2canvas': ['html2canvas'],
          'wechat': ['weixin-js-sdk'],
        },
      },
    },
  },
});
```

### 11.3 CDN配置
- 将 `dist/assets` 目录上传到CDN
- 更新图片资源的CDN路径
- 配置CDN缓存策略（图片长期缓存，JS短期缓存）

### 11.4 后端接口需求
需要后端提供以下接口：

#### 1. 微信签名接口
```http
POST /api/wechat/signature
Content-Type: application/json

{
  "url": "https://example.com/activity"
}

Response:
{
  "appId": "wx123456",
  "timestamp": 1699689600,
  "nonceStr": "abcdefg",
  "signature": "sha1_signature"
}
```

#### 2. 分享统计接口
```http
POST /api/share-stats
Content-Type: application/json

{
  "page": "activity-page",
  "shareType": "wechat",
  "timestamp": 1699689600,
  "userAgent": "Mozilla/5.0..."
}

Response:
{
  "success": true
}
```

#### 3. 二维码生成接口（可选）
```http
GET /api/qrcode?data=https://example.com/activity

Response: image/png
```

## 十二、项目实施计划

### 阶段1: 项目准备（1天）
- [ ] 安装依赖包（swiper、html2canvas、weixin-js-sdk）
- [ ] 创建目录结构
- [ ] 配置路由
- [ ] 添加viewport meta标签

### 阶段2: 轮播组件开发（2天）
- [ ] 实现SwiperCarousel组件
- [ ] 集成自动播放和触摸滑动
- [ ] 添加懒加载和指示器
- [ ] 单元测试

### 阶段3: 分享功能开发（3天）
- [ ] 实现ShareButton组件
- [ ] 集成微信JS-SDK
- [ ] 实现海报生成功能
- [ ] 添加分享统计埋点
- [ ] 单元测试

### 阶段4: 活动页整合（2天）
- [ ] 创建ActivityPage主组件
- [ ] 整合轮播和分享组件
- [ ] 添加移动端适配样式
- [ ] 性能优化

### 阶段5: 测试和优化（2天）
- [ ] Playwright E2E测试
- [ ] 手动兼容性测试
- [ ] 性能测试和优化
- [ ] Bug修复

### 阶段6: 部署上线（1天）
- [ ] 生产构建
- [ ] 上传到服务器/CDN
- [ ] 配置域名和SSL
- [ ] 监控和日志

**总计**: 11个工作日

## 十三、风险评估和应对

### 13.1 技术风险
| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 微信JS-SDK配置失败 | 高 | 准备备用分享方案（海报+手动分享） |
| html2canvas生成失败 | 中 | 提供备用海报下载链接 |
| 移动端兼容性问题 | 中 | 提前在多设备测试，准备polyfill |
| 图片加载缓慢 | 低 | 使用CDN、懒加载、压缩图片 |

### 13.2 时间风险
| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 后端接口延迟 | 高 | 提供mock数据，接口完成后替换 |
| 需求变更 | 中 | 保持组件化设计，便于调整 |
| 测试发现问题 | 低 | 预留缓冲时间，优先修复关键问题 |

### 13.3 运维风险
| 风险 | 影响 | 应对措施 |
|------|------|----------|
| 流量激增 | 高 | 使用CDN、配置缓存、限流 |
| 安全攻击 | 高 | 配置WAF、监控异常、定期安全检查 |
| 分享链接被刷 | 中 | 添加token验证、频率限制 |

## 十四、后续优化建议

1. **A/B测试**: 测试不同轮播内容的转化率
2. **数据分析**: 接入Google Analytics或友盟统计
3. **PWA支持**: 添加离线缓存和添加到桌面功能
4. **动画优化**: 使用Lottie或CSS动画提升体验
5. **预加载**: 预加载关键资源提升首屏速度
6. **图片格式**: 使用WebP格式进一步压缩图片

## 十五、关键文件路径总结

| 类别 | 文件路径 |
|------|----------|
| 路由配置 | `src/router/index.tsx` |
| 活动页组件 | `src/pages/ActivityPage/index.tsx` |
| 轮播组件 | `src/components/activity/SwiperCarousel/` |
| 分享组件 | `src/components/activity/ShareButton/` |
| 微信分享工具 | `src/utils/share/wechat.ts` |
| 海报生成工具 | `src/utils/share/poster.ts` |
| 埋点工具 | `src/utils/share/shareStats.ts` |
| 移动端工具 | `src/utils/mobile.ts` |
| E2E测试 | `tests/activity.spec.ts` |
| 构建配置 | `vite.config.ts` |
| 包依赖 | `package.json` |

---

**文档版本**: v1.0
**创建日期**: 2026-03-15
**技术栈**: React 18 + TypeScript + Vite + Tailwind CSS
**预计工期**: 11个工作日
