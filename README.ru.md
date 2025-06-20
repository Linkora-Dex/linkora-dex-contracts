# DEX Smart Contracts

Децентрализованная биржа с маржинальной торговлей и upgradeable архитектурой

## Быстрый старт

```bash
# Установка зависимостей
npm install

# Компиляция контрактов
npm run compile

# Запуск локальной сети
npm run node

# Деплой системы (в новом терминале)
npm run prod:deploy:config

# Запуск сервисов
npm run price-generator-anvil    # Генератор цен
npm run keeper:upgradeable-anvil # Исполнитель ордеров
npm run trading-demo-anvil       # Демо торговли
```

## Архитектура

### Core DEX
**Upgradeable Proxy Pattern:**
- Router Proxy → Router Implementation
- Pool Proxy → Pool Implementation  
- Trading Proxy → Trading Implementation
- Oracle Proxy → Oracle Implementation

**Конфигурация:** `config/anvil_upgradeable-config.json`

### Governance Token (опционально)
**Дополнительные возможности:**
- Торговые скидки до 10%
- Staking с наградами от комиссий
- Система голосований для управления
- Premium функции доступа

**Конфигурация:** `config/token-config.json`

## Основные фичи

### Core DEX
- ✅ Spot торговля
- ✅ Лимитные ордера
- ✅ Стоп-лосс ордера  
- ✅ Маржинальная торговля
- ✅ Ликвидность провайдинг
- ✅ Upgradeable контракты
- ✅ Flash loan защита
- ✅ Circuit breaker

### Governance Token (опционально)
- ✅ ERC-20 с расширенными функциями
- ✅ Система торговых скидок
- ✅ Staking с удвоенным весом в голосованиях
- ✅ Распределение части комиссий stakers
- ✅ Timelock governance с кворумом
- ✅ Premium функции для крупных держателей

## Развертывание и управление

### Основная система
- [Deployment Guide](./readme_deployment_guide.md) - Пошаговое развертывание
- [Scripts Overview](./scripts/readme.md) - Описание всех скриптов
- [Security Analysis](./docs/readme_slither.md) - Анализ безопасности

### Governance и токеномика
- [Governance Token Guide](./docs/readme_governance.md) - Руководство для пользователей
- [Monetization Model](./docs/readme_monetization.md) - Экономическая модель
- [Technical Tokenomics](./docs/readme_tokenomics.md) - Техническая документация

## Команды разработки

### Деплой и тестирование
```bash
# Полный pipeline деплоя
npm run prod:infrastructure  # Инфраструктура
npm run prod:tokens         # Токены и цены
npm run prod:pools          # Ликвидность

# Governance токен
npm run deploy:governance-token
npm run verify:governance-token

# Тестирование
npm run test:integration
npm run test:full-upgradeable
npm run verify:upgrades
```

### Сервисы и автоматизация
```bash
# Runtime сервисы
npm run price-generator-anvil    # Обновление цен
npm run keeper:upgradeable-anvil # Исполнение ордеров
npm run trading-demo-anvil       # Демонстрация торговли

# Управление
npm run pause                   # Экстренная остановка
npm run unpause                 # Возобновление работы
npm run cancel-all              # Отмена всех ордеров
```

### Docker развертывание
```bash
# Полная среда разработки
./docker-run.sh full

# Отдельные компоненты
./docker-run.sh start    # Только нода
./docker-run.sh deploy   # Деплой контрактов
./docker-run.sh services # Автоматизация
```

## Принципы работы

### Модульная архитектура
- **Core DEX**: Полностью работает без токена
- **Governance Token**: Опциональное дополнение
- **Простая интеграция**: Токен подключается одной командой

### Router-центричный дизайн
- Все операции через единый Router контракт
- Upgradeable без изменения адресов
- Обратная совместимость гарантирована

### Безопасность
- Timelock для всех governance изменений
- Кворум для валидности решений
- Ограничения на критические параметры
- Возможность экстренной остановки
- Flash loan protection
- Circuit breaker механизмы

## Структура проекта

```
├── contracts/
│   ├── upgradeable/     # Основные контракты
│   ├── governance/      # Governance токен
│   ├── libraries/       # Библиотеки логики
│   └── access/         # Контроль доступа
├── scripts/
│   ├── prod_*          # Production деплой
│   ├── utils/          # Утилиты управления
│   └── tests/          # Интеграционные тесты
├── config/             # Конфигурации
└── docs/              # Документация
```

## Безопасность и аудит

- Upgradeable proxy pattern с timelock защитой
- Comprehensive тестирование с >95% coverage
- Static analysis с Slither
- Emergency pause функциональность
- Multi-signature governance для критических операций

## Лицензия

MIT License - см. [LICENSE](./LICENSE) для деталей

## Поддержка

- Техническая документация в папке `docs/`
- Примеры использования в `scripts/`
- Issues и вопросы через GitHub
