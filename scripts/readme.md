# Scripts

## Production Deployment Pipeline

```bash
npm run compile
```

```bash
slither ./contracts/core --solc-remaps @openzeppelin/=./node_modules/@openzeppelin/ --config-file slither.config.json
```



### [prod_deploy-infrastructure.js](prod_deploy-infrastructure.js)
Деплоит базовую инфраструктуру DEX: upgradeable контракты (Oracle, Pool, Trading, Router), библиотеки и security контракты. Создает минимальную архитектуру без токенов и ликвидности.
```bash
npm run prod:infrastructure
```

### [prod_setup-tokens.js](prod_setup-tokens.js)
Создает тестовые токены, минтит их пользователям и устанавливает начальные цены через Oracle. Требует завершенный деплой инфраструктуры.
```bash
npm run prod:tokens
```

### [prod_create-pools.js](prod_create-pools.js)
Добавляет начальную ликвидность в пулы, тестирует базовую функциональность и финализирует деплой. Последний этап продакшн pipeline.
```bash
npm run prod:pools
# Или полный pipeline:
npm run prod:deploy:config
```

### [deploy-governance-token.js](deploy-governance-token.js)
Деплоит upgradeable Governance Token с функциями staking, voting, fee distribution и интегрирует с существующей DEX. Поддерживает настройку параметров governance и распределения токенов.
```bash
npm run deploy:governance-token
npm run verify:governance-token
npm run setup:token-distribution
```

## Runtime Services

### [priceGenerator.js](priceGenerator.js)
Автоматически обновляет цены токенов с настраиваемой волатильностью, имитируя реальный рынок. Включает circuit breaker protection и volatile events для тестирования.
```bash
npm run price-generator-anvil
```

### [keeper-upgradeable.js](keeper-upgradeable.js)
Мониторит и исполняет limit/stop-loss ордера, ликвидирует позиции с высоким риском. Работает через upgradeable Router с автоматическими наградами за исполнение.
```bash
npm run keeper:upgradeable-anvil
```

### [tradingDemo.js](tradingDemo.js)
Демонстрирует полный функционал DEX: swaps, limit orders, stop-loss, позиции, emergency pause. Создает тестовые сценарии для проверки всех features.
```bash
npm run trading-demo-anvil
```

## Utilities & Diagnostics

### [check-balance.js](check-balance.js)
Проверяет ETH балансы deployer, keeper и hardhat accounts. Полезно для диагностики перед деплоем или при проблемах с транзакциями.
```bash
npm run check-balance
```

### [priceGeneratorDiagnostics.js](priceGeneratorDiagnostics.js)
Диагностирует проблемы с Oracle и price updates: проверяет права доступа, gas settings, системный статус. Помогает найти причины сбоев в price generator.
```bash
npm run price-diagnostics
```

### utils/[cancelOrderSimple.js](utils/cancelOrderSimple.js)
Управляет ордерами: отмена конкретного ордера, всех pending ордеров или просмотр списка. Критически важен для тестирования и отладки торговой логики.
```bash
npm run list-orders     # Показать все ордера
npm run cancel-1        # Отменить ордер #1
npm run cancel-all      # Отменить все pending
```

## Emergency & Security

### utils/[pause.js](utils/pause.js) / [unpause.js](utils/unpause.js) / [toggle-pause.js](utils/toggle-pause.js)
Экстренное управление системой: остановка/возобновление всех торговых операций через AccessControl. Только для админа при обнаружении критических проблем.
```bash
npm run pause           # Остановить торговлю
npm run unpause         # Возобновить торговлю  
npm run toggle-pause    # Переключить статус
```

## Upgrades & Validation

### utils/[verify-upgrades.js](utils/verify-upgrades.js)
Комплексная проверка upgradeable контрактов: proxy addresses, implementations, роли доступа, интеграции. Обязательно после любого деплоя или апгрейда.
```bash
npm run verify:upgrades
```

### utils/[validate-storage.js](utils/validate-storage.js)
Валидирует storage layout совместимость перед апгрейдом контрактов. Предотвращает потерю данных при обновлении implementations.
```bash
npm run validate:storage
```

## Testing

### tests/[UpgradeableIntegration.test.js](tests/UpgradeableIntegration.test.js)
Интеграционные тесты upgradeable архитектуры: proxy patterns, роли доступа, базовый функционал. Быстрая проверка корректности деплоя.
```bash
npm run test:integration
```

### tests/[UpgradeSimulation.test.js](tests/UpgradeSimulation.test.js)
Симулирует процесс апгрейда контрактов: сохранение данных, rollback сценарии, emergency upgrades. Тестирует upgrade safety.
```bash
npm run test:upgrade-simulation
```

### tests/[FullUpgradeableTest.test.js](tests/FullUpgradeableTest.test.js)
Полное end-to-end тестирование всей DEX системы: архитектура, торговля, безопасность, производительность. Комплексная валидация перед продакшн.
```bash
npm run test:full-upgradeable
```