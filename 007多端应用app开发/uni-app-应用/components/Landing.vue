<template>
  <scroll-view scroll-y class="landing-screen">
    <view class="landing-header">
      <view class="landing-brand"><view class="landing-logo">♥</view><view class="landing-brand-names"><text>翔翔记账</text><text>Peach Journal</text></view></view>
      <view class="landing-header-actions"><text @tap="$emit('login')">登录</text><text @tap="$emit('guest')">免费开始记账 →</text></view>
    </view>
    <view class="landing-main">
      <view class="landing-hero">
        <view class="landing-pill">✿　治愈系日常记账本 · 把生活过成一本书</view>
        <text class="landing-title">像翻开一本治愈系手账，</text>
        <text class="landing-title accent">10秒轻松记录</text>
        <text class="landing-title">日常小确幸</text>
        <text class="landing-subtitle">无需繁琐复杂的分类与压力，给每笔支出赋予温柔的记忆。手账式开箱即用，把柴米油盐变成认真生活的踏实与美好。</text>
        <view class="landing-ctas"><button class="landing-login" @tap="$emit('login')">登录账号　→</button><button class="landing-guest" @tap="$emit('guest')">✎　免登录直接体验</button></view>
      </view>
      <view class="landing-preview">
        <view class="preview-head"><view class="preview-dots"><text></text><text></text><text></text></view><text>Peach Journal · 今日手账</text><text class="preview-weather">● 今日生活感悟 · 晴</text></view>
        <view class="preview-columns">
          <view class="preview-entries">
            <view class="preview-section"><text>▦　今日记账明细</text><text>2024年秋 · 第42周</text></view>
            <view class="preview-entry"><text class="preview-icon">☕</text><view><text>燕麦拿铁与肉桂卷</text><text>14:20 · 街角面包房</text></view><text>-¥32.00</text></view>
            <view class="preview-entry"><text class="preview-icon orange">✎</text><view><text>手账胶带与信纸</text><text>16:45 · 拾光文具店</text></view><text>-¥28.50</text></view>
            <view class="preview-entry"><text class="preview-icon green-bg">✦</text><view><text>兼职插画设计定金</text><text>11:10 · 稿酬入账</text></view><text class="green">+¥600.00</text></view>
          </view>
          <view class="preview-summary"><view><text>本月小结</text><text>10月记录中</text></view><text>本月结余</text><text class="preview-total">¥2,840.00</text><view class="preview-quote">“记录并不是为了克制欲望，而是看清那些真正带来幸福感的开销 ✨”</view><view class="preview-tags"><text>☕ 咖啡小确幸</text><text>🌱 支出从容</text></view></view>
        </view>
      </view>
      <view class="landing-section"><text class="landing-kicker">Warm & Simple</text><text class="landing-section-title">为什么喜欢用它记账</text><text class="landing-section-sub">卸下数字的沉重包袱，让记账像写日记一样轻盈从容。</text><view class="landing-features"><view><text>✎</text><text>01 / 轻松记录</text><text>随手记下生活的温度</text><text>输入数字与轻按分类即可保存，十秒完成每日记录。</text></view><view><text>◔</text><text>02 / 一目了然</text><text>柔和粉彩图表节奏</text><text>舒缓的色调呈现收支流动，踏实地看清钱花在哪里。</text></view><view><text>♥</text><text>03 / 纯净无扰</text><text>无广告干扰的静谧</text><text>留给你一个纯净的手账小天地，沉浸在每笔日常。</text></view></view></view>
      <view class="landing-section"><text class="landing-kicker">Community Voices</text><text class="landing-section-title">手账朋友们的日常心声</text><text class="landing-section-sub">简单真诚的陪伴，让记账慢慢成为生活习惯。</text><view class="landing-review">“翔翔记账粉嫩干净，让我每天睡前都期待翻开记几笔。”<text>林小暖 · 插画师</text></view></view>
      <view class="landing-section"><text class="landing-section-title">常见疑问</text><view class="landing-faq"><text>真的可以免登录直接使用吗？</text><text>是的，点击「免登录直接体验」即可开始记账。账单先保存在当前设备。</text></view><view class="landing-faq"><text>手机和电脑都可以使用吗？</text><text>支持手机与电脑使用；登录后可通过后端接口同步数据。</text></view></view>
      <view class="landing-end"><text>从今天开始，温柔地记录生活</text><view><button class="landing-login" @tap="$emit('login')">登录账号</button><button class="landing-guest" @tap="$emit('guest')">免登录直接体验</button></view></view>
    </view>
  </scroll-view>
</template>
<script>
export default { emits: ["login", "guest"] };
</script>
<style>
@import './landing.css';
</style>
