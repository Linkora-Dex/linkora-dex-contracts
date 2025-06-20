
# Deployment Guide

Пошаговое руководство по развертыванию Linkora DEX с upgradeable архитектурой.

## Предварительные требования

### Системные требования
- Node.js 18+
- NPM или Yarn
- Git
- 8GB RAM минимум

### Инструменты разработки
```bash
npm install -g hardhat
npm install -g @openzeppelin/hardhat-upgrades
```

## Быстрый старт

### 1. Установка зависимостей
```bash
git clone <repository>
cd linkora-dex-contracts
npm install
```

### 2. Компиляция контрактов
```bash
npm run compile
```

### 3. Запуск локальной сети
```bash
npm run node
```

### 4. Полное развертывание
```bash
npm run prod:deploy:config
```

### 5. Запуск сервисов
```bash
# Новые терминалы
npm run price-generator-anvil
npm run keeper:upgradeable-anvil
npm run trading-demo-anvil
```

## Поэтапное развертывание

### Этап 1 - Инфраструктура
```bash
npm run prod:infrastructure
```

**Развертывает**
- AccessControl и ReentrancyGuard
- Библиотеки (PoolLibrary, TradingLibrary, RouterLibrary)
- Upgradeable контракты (Oracle, Pool, Trading, Router)
- Настройка ролей и разрешений

**Результат** `config/anvil_infrastructure-config.json`

### Этап 2 - Токены и цены
```bash
npm run prod:tokens
```

**Создает**
- Тестовые ERC20 токены (CAPY, AXOL, QUOK, PANG, NARW)
- Минтинг токенов пользователям
- Установка начальных цен через Oracle

**Результат** `config/anvil_tokens-config.json`

### Этап 3 - Ликвидность
```bash
npm run prod:pools
```

**Добавляет**
- Начальную ETH ликвидность (100 ETH)
- Токенную ликвидность пропорционально ценам
- Проверка базовой функциональности

**Результат** `config/anvil_final-config.json`

## Governance Token (опционально)

### Развертывание токена управления
```bash
npm run deploy:governance-token
```

### Настройка параметров
Отредактируйте `config/token-config.json`
```json
{
  "name": "Your DEX Token",
  "symbol": "YDT", 
  "maxSupply": "10000000",
  "governance": {
    "proposalThreshold": "10000",
    "votingPeriod": 604800,
    "executionDelay": 172800,
    "quorum": "100000"
  }
}
```

### Верификация токена
```bash
npm run verify:governance-token
```

## Конфигурация сети

### Anvil (локальная разработка)
```javascript
// hardhat.config.js
anvil: {
  url: "http://127.0.0.1:8545",
  chainId: 31337,
  accounts: [
    process.env.ANVIL_DEPLOYER_PRIVATE_KEY,
    process.env.ANVIL_KEEPER_PRIVATE_KEY
  ]
}
```

### Настройка .env
```bash
ANVIL_DEPLOYER_PRIVATE_KEY=your_private_key_here
ANVIL_KEEPER_PRIVATE_KEY=your_private_key_here
```

### Настройка конфигурации
Отредактируйте `config/deployment-config.json`
```json
{
  "network": {
    "name": "anvil",
    "chainId": 31337,
    "url": "http://127.0.0.1:8545"
  },
  "accounts": {
    "deployer": "0xbA5C24084c98A42974f324F377c87Ad44900648E",
    "keeper": "0x3a683E750b98A372f7d7638532afe8877fE3FF2D"
  },
  "tokens": [...],
  "liquidity": {
    "ethAmount": "100",
    "tokenMultiplier": 1
  }
}
```

## Docker развертывание

### Полная среда разработки
```bash
./docker-run.sh full
```

### Отдельные компоненты
```bash
./docker-run.sh start    # Только нода
./docker-run.sh deploy   # Развертывание контрактов  
./docker-run.sh services # Автоматизация
```

## Управление системой

### Экстренные команды
```bash
npm run pause           # Остановка торговли
npm run unpause         # Возобновление торговли
npm run cancel-all      # Отмена всех ордеров
```

### Мониторинг
```bash
npm run check-balance   # Проверка балансов
npm run price-diagnostics # Диагностика Oracle
npm run list-orders     # Список активных ордеров
```

### Тестирование
```bash
npm run test:integration        # Интеграционные тесты
npm run test:full-upgradeable   # Полное тестирование
npm run verify:upgrades         # Проверка upgrades
```

## Устранение неполадок

### Частые проблемы

**Ошибка "Price change too large"**
```bash
# Снизьте волатильность в priceGenerator.js
VOLATILITY_CONFIG.DEFAULT_VOLATILITY = 0.01
```

**Ошибка nonce**
```bash
# Увеличьте задержки в конфигурации
INDIVIDUAL_UPDATE_DELAY: 2000
```

**Недостаточно газа**
```bash
# Увеличьте лимит газа в hardhat.config.js
gasLimit: 30000000
```

### Диагностика

**Проверка состояния системы**
```bash
# Статус pause
npm run check-balance

# Права доступа
npm run verify:upgrades

# Состояние Oracle
npm run price-diagnostics
```

**Восстановление после ошибок**
```bash
# Очистка и переразвертывание
npm run clean
npm run compile
npm run prod:deploy:config
```

## Безопасность

### Ключи и аккаунты
- Используйте отдельные ключи для deployer и keeper
- Настройте мультиподпись для продакшена
- Регулярно ротируйте keeper ключи

### Мониторинг
- Следите за размером изменений цен
- Контролируйте объемы торговли
- Настройте алерты на критические события

### Обновления
- Тестируйте все обновления на тестнете
- Используйте timelock для критических изменений
- Сохраняйте резервные копии состояния

## Продакшен чеклист

### Перед запуском
- [ ] Проведен аудит безопасности
- [ ] Протестированы все сценарии использования
- [ ] Настроен мониторинг и алерты
- [ ] Подготовлены процедуры экстренного реагирования
- [ ] Проверена совместимость с внешними сервисами

### После запуска
- [ ] Мониторинг газовых расходов
- [ ] Отслеживание производительности keeper
- [ ] Анализ торговой активности
- [ ] Регулярные проверки безопасности

Полная документация доступна в `docs/` директории.


