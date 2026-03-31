# Тестовый документ Mivra

Это тестовый документ для проверки рендеринга **жирного текста**, *курсива*, ~~зачёркнутого~~ и `inline code`. А также [ссылок](https://example.com).

## Списки

### Маркированный список
- Первый элемент
- Второй элемент
  - Вложенный элемент
  - Ещё один вложенный
- Третий элемент

### Нумерованный список
1. Шаг первый
2. Шаг второй
3. Шаг третий

## Цитата

> Простота — высшая степень утончённости.
> — Леонардо да Винчи

## Блок кода

```typescript
function greet(name: string): string {
  return `Привет, ${name}!`;
}

console.log(greet("Мир"));
```

---

## Таблицы

### Сравнение фреймворков

| Фреймворк | Язык       | Звёзды GitHub | Год выпуска |
|-----------|------------|---------------|-------------|
| React     | JavaScript | 225k          | 2013        |
| Vue       | JavaScript | 208k          | 2014        |
| Angular   | TypeScript | 96k           | 2016        |
| Svelte    | JavaScript | 80k           | 2016        |
| SolidJS   | TypeScript | 33k           | 2021        |

### Статус задач

| ID  | Задача                     | Приоритет | Статус      |
|-----|---------------------------|-----------|-------------|
| 001 | Настройка CI/CD           | Высокий   | Выполнено   |
| 002 | Рефакторинг авторизации   | Средний   | В работе    |
| 003 | Оптимизация запросов к БД | Высокий   | Ожидание    |
| 004 | Написание документации    | Низкий    | Не начато   |

---

## Диаграммы Mermaid

### Flowchart — архитектура приложения

```mermaid
graph TD
    A[Пользователь] --> B[Frontend - React]
    B --> C{Авторизован?}
    C -->|Да| D[Firebase Firestore]
    C -->|Нет| E[Страница входа]
    E --> F[Firebase Auth]
    F --> C
    D --> G[(База данных)]
    B --> H[Tauri API]
    H --> I[Файловая система]
```

### Sequence — процесс сохранения файла

```mermaid
sequenceDiagram
    participant U as Пользователь
    participant E as Редактор
    participant T as Tauri
    participant FS as Файловая система

    U->>E: Ctrl+S
    E->>E: Получить содержимое
    E->>T: invoke("save_file")
    T->>FS: Записать файл
    FS-->>T: OK
    T-->>E: Успех
    E-->>U: Уведомление "Сохранено"
```

### Pie — распределение времени

```mermaid
pie title Распределение рабочего дня
    "Код" : 40
    "Ревью" : 15
    "Встречи" : 20
    "Документация" : 10
    "Тестирование" : 15
```

### Gantt — план проекта

```mermaid
gantt
    title План разработки v0.3
    dateFormat YYYY-MM-DD
    section Бэкенд
        API endpoints      :a1, 2026-03-17, 5d
        Миграция БД        :a2, after a1, 3d
    section Фронтенд
        Новые компоненты   :b1, 2026-03-17, 7d
        Интеграция          :b2, after b1, 4d
    section Тестирование
        Unit тесты          :c1, after a2, 3d
        E2E тесты           :c2, after b2, 3d
```

### Class diagram — структура данных

```mermaid
classDiagram
    class Task {
        +string id
        +string title
        +string date
        +boolean completed
        +number order
        +Checkpoint[] checkpoints
        +toggleComplete()
        +addCheckpoint()
    }
    class Checkpoint {
        +string id
        +string text
        +boolean done
        +toggle()
    }
    class TaskRepository {
        <<interface>>
        +getTasks(date) Task[]
        +addTask(task) Task
        +updateTask(id, data)
        +deleteTask(id)
    }
    Task "1" --> "*" Checkpoint
    TaskRepository ..> Task
```

### State diagram — жизненный цикл задачи

```mermaid
stateDiagram-v2
    [*] --> Создана
    Создана --> ВРаботе: Взять в работу
    ВРаботе --> НаРевью: Отправить на проверку
    НаРевью --> ВРаботе: Вернуть на доработку
    НаРевью --> Выполнена: Одобрить
    Выполнена --> [*]
```
