<template>
  <div id="app">
    <el-container class="layout-container">
      <!-- 侧边栏 -->
      <el-aside :width="isCollapse ? '64px' : '220px'" class="sidebar">
        <div class="sidebar-header">
          <div class="logo">
            <img src="@/assets/head.png" alt="Logo" class="logo-img" />
            <span v-show="!isCollapse" class="logo-text">星野自媒体助手</span>
          </div>
          <el-button 
            type="text" 
            @click="toggleCollapse"
            class="collapse-btn"
          >
            <el-icon>
              <Fold v-if="!isCollapse" />
              <Expand v-else />
            </el-icon>
          </el-button>
        </div>
        
        <el-menu
          :default-active="activeMenu"
          class="sidebar-menu"
          :collapse="isCollapse"
          :unique-opened="true"
          router
        >
          <el-menu-item index="/">
            <el-icon><House /></el-icon>
            <template #title>首页</template>
          </el-menu-item>
          
          <el-menu-item index="/account-management">
            <el-icon><User /></el-icon>
            <template #title>账号管理</template>
          </el-menu-item>
          
          <el-menu-item index="/material-management">
            <el-icon><Picture /></el-icon>
            <template #title>素材管理</template>
          </el-menu-item>
          
          <el-menu-item index="/publish-center">
            <el-icon><Upload /></el-icon>
            <template #title>视频发布</template>
          </el-menu-item>

          <el-menu-item index="/image-publish">
            <el-icon><PictureFilled /></el-icon>
            <template #title>图文发布</template>
          </el-menu-item>

          <el-menu-item index="/draft-box">
            <el-icon><FolderOpened /></el-icon>
            <template #title>草稿箱</template>
          </el-menu-item>

          <el-menu-item index="/task-center">
            <el-icon><List /></el-icon>
            <template #title>任务中心</template>
          </el-menu-item>

          <el-menu-item index="/publish-history">
            <el-icon><Clock /></el-icon>
            <template #title>发布记录</template>
          </el-menu-item>

          <el-menu-item index="/settings">
            <el-icon><Setting /></el-icon>
            <template #title>配置管理</template>
          </el-menu-item>

          <el-menu-item index="/about">
            <el-icon><InfoFilled /></el-icon>
            <template #title>关于</template>
          </el-menu-item>
        </el-menu>
      </el-aside>
      
      <!-- 主内容区 -->
      <el-container class="main-container">
        <!-- 主内容 -->
        <el-main class="main-content">
          <div class="content-wrapper">
            <router-view />
          </div>
        </el-main>
      </el-container>
    </el-container>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import {
  Fold, Expand, House, User, Picture, PictureFilled, Upload, InfoFilled, Clock, FolderOpened, List, Setting
} from '@element-plus/icons-vue'
import { useAppStore } from '@/stores/app'

const route = useRoute()
const appStore = useAppStore()

// 侧边栏折叠状态 - 默认展开
const isCollapse = ref(false)

// 当前激活的菜单项
const activeMenu = computed(() => {
  return route.path
})

// 切换侧边栏折叠状态
const toggleCollapse = () => {
  isCollapse.value = !isCollapse.value
}

// 静默检查版本更新（在后台记录，不打扰用户）
const checkUpdateSilently = async () => {
  try {
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5409'
    const res = await fetch(`${baseUrl}/checkUpdate`)
    const result = await res.json()
    if (result.code === 200 && result.data) {
      appStore.setUpdateInfo(result.data)
    }
  } catch (e) {
    // 网络不通时静默忽略
  }
}

let updateCheckTimer = null

onMounted(() => {
  checkUpdateSilently()
  updateCheckTimer = setInterval(checkUpdateSilently, 4 * 60 * 60 * 1000)
})

onUnmounted(() => {
  if (updateCheckTimer) clearInterval(updateCheckTimer)
})
</script>

<style lang="scss" scoped>
@use '@/styles/variables.scss' as *;

#app {
  min-height: 100vh;
}

.layout-container {
  min-height: 100vh;
}

.sidebar {
  background-color: #fff;
  box-shadow: 2px 0 6px rgba(0, 21, 41, 0.08);
  transition: width 0.3s;
  overflow: hidden;
  
  .sidebar-header {
    height: 60px;
    padding: 0 16px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    border-bottom: 1px solid $border-lighter;
    
    .logo {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;

      .logo-img {
        width: 32px;
        height: 32px;
        border-radius: 6px;
        flex-shrink: 0;
        object-fit: cover;
      }

      .logo-text {
        font-size: 16px;
        font-weight: 600;
        color: $text-primary;
        white-space: nowrap;
      }
    }
    
    .collapse-btn {
      color: $text-regular;
      font-size: 16px;
      padding: 0;
      
      &:hover {
        color: $primary-color;
      }
    }
  }
  
  .sidebar-menu {
    border-right: none;
    height: calc(100vh - 60px);
    overflow-y: auto;
    overflow-x: hidden;

    // 滚动条样式优化
    &::-webkit-scrollbar {
      width: 4px;
    }

    &::-webkit-scrollbar-track {
      background: transparent;
    }

    &::-webkit-scrollbar-thumb {
      background: rgba(0, 0, 0, 0.12);
      border-radius: 2px;

      &:hover {
        background: rgba(0, 0, 0, 0.25);
      }
    }

    :deep(.el-menu-item),
    :deep(.el-sub-menu__title) {
      height: 48px;
      line-height: 48px;
      
      &.is-active {
        background-color: #ecf5ff;
        color: $primary-color;
        border-right: 3px solid $primary-color;
      }
      
      &:hover {
        background-color: $bg-color-page;
      }
    }
    
    :deep(.el-sub-menu .el-menu-item) {
      height: 44px;
      line-height: 44px;
      padding-left: 50px !important;
      
      &.is-active {
        background-color: #ecf5ff;
        color: $primary-color;
        border-right: 3px solid $primary-color;
      }
    }
  }
}

.main-container {
  background-color: $bg-color-page;
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  
  .main-content {
    padding: 20px;
    flex: 1;
    overflow-y: auto;
    
    .content-wrapper {
      max-width: 1400px;
      margin: 0 auto;
    }
  }
}

// 响应式设计
@media (max-width: 768px) {
  .sidebar {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1000;
    height: 100vh;
  }
  
  .main-container {
    margin-left: 64px;
  }
}
</style>