<template>
  <div class="about-page">
    <div class="about-content">
      <img src="@/assets/head.png" alt="Logo" class="about-logo" />
      <h1 class="project-name">星野自媒体矩阵助手</h1>
      <span class="version-tag">v{{ APP_VERSION }}</span>

      <p class="project-desc">
        专注多平台自媒体内容一键分发与矩阵管理，支持抖音、小红书、视频号、快手、哔哩哔哩、百家号等主流平台的高效自动发布，助力创作者与电商团队降本增效。
      </p>

      <div class="repo-links">
        <a :href="GITHUB_REPO_URL" target="_blank" class="repo-card">
          <div class="repo-title">官方项目仓库</div>
          <div class="repo-sub">查看最新源码、说明文档与版本更新</div>
          <div class="repo-url">{{ GITHUB_REPO_URL }}</div>
        </a>
      </div>

      <div class="thanks-note">
        开源致谢：本系统基于开源项目 social-auto-upload-web-ui 与 social-auto-upload 二次开发构建，遵循 MIT 开源协议。
      </div>
    </div>
  </div>
</template>

<script setup>
import { APP_VERSION, GITHUB_REPO_URL } from '@/config/app'
</script>

<style lang="scss" scoped>
@use '@/styles/variables.scss' as *;

.about-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: calc(100vh - 100px);
}

.about-content {
  text-align: center;
  max-width: 560px;
  padding: 40px 24px;
}

.about-logo {
  width: 80px;
  height: 80px;
  border-radius: 16px;
  object-fit: cover;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
  margin-bottom: 16px;
}

.project-name {
  font-size: 24px;
  font-weight: 700;
  color: $text-primary;
  margin: 0 0 8px;
}

.version-tag {
  display: inline-block;
  padding: 2px 12px;
  font-size: 13px;
  font-weight: 500;
  color: $primary-color;
  background-color: #ecf5ff;
  border-radius: 12px;
  margin-bottom: 20px;
}

.project-desc {
  font-size: 14px;
  line-height: 1.8;
  color: $text-regular;
  margin: 0 0 32px;
}

.repo-links {
  display: flex;
  gap: 16px;
  justify-content: center;
}

.repo-card {
  flex: 1;
  padding: 20px 16px;
  border: 1px solid $border-lighter;
  border-radius: 8px;
  background: #fff;
  text-decoration: none;
  transition: all 0.25s;

  &:hover {
    border-color: $primary-color;
    box-shadow: 0 4px 12px rgba(64, 158, 255, 0.12);
    transform: translateY(-2px);
  }

  .repo-title {
    font-size: 15px;
    font-weight: 600;
    color: $text-primary;
    margin-bottom: 6px;
  }

  .repo-sub {
    font-size: 12px;
    color: $text-secondary;
    margin-bottom: 10px;
  }

  .repo-url {
    font-size: 12px;
    color: $primary-color;
    word-break: break-all;
  }
}

.thanks-note {
  margin-top: 32px;
  font-size: 12px;
  color: $text-secondary;
}
</style>