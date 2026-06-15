const Store = (function() {
    const STORAGE_KEY = 'workOrderSchedules';
    const CURRENT_SCHEME_KEY = 'currentScheduleScheme';
    const CALENDAR_KEY = 'productionCalendar';

    const ORDER_STATUS = {
        PENDING: 'pending',
        SCHEDULED: 'scheduled',
        IN_PROGRESS: 'in_progress',
        COMPLETED: 'completed',
        CANCELLED: 'cancelled'
    };

    const STATUS_LABELS = {
        pending: '待排程',
        scheduled: '已排程',
        in_progress: '已开工',
        completed: '已完成',
        cancelled: '已取消'
    };

    const STATUS_COLORS = {
        pending: '#9aa4bd',
        scheduled: '#00d4ff',
        in_progress: '#ff9500',
        completed: '#34c759',
        cancelled: '#ff3b30'
    };

    const LINES = [
        { id: 'lineA', name: 'A线', color: '#00d4ff', workStartTime: 480, workEndTime: 1080 },
        { id: 'lineB', name: 'B线', color: '#ff9500', workStartTime: 480, workEndTime: 1080 },
        { id: 'lineC', name: 'C线', color: '#34c759', workStartTime: 480, workEndTime: 1080 }
    ];

    const DEFAULT_CALENDAR = {
        workDays: [1, 2, 3, 4, 5],
        downtimePeriods: [],
        workStartTime: 480,
        workEndTime: 1080
    };

    let state = {
        workOrders: [],
        currentSchemeId: null,
        schemes: [],
        calendar: null
    };

    function init() {
        loadCalendar();
        loadFromStorage();
        if (state.schemes.length === 0) {
            createDemoData();
        }
        migrateOrders();
    }

    function loadCalendar() {
        try {
            const stored = localStorage.getItem(CALENDAR_KEY);
            if (stored) {
                state.calendar = JSON.parse(stored);
            } else {
                state.calendar = Utils.deepClone(DEFAULT_CALENDAR);
                saveCalendar();
            }
        } catch (e) {
            console.error('加载日历失败:', e);
            state.calendar = Utils.deepClone(DEFAULT_CALENDAR);
        }
    }

    function saveCalendar() {
        try {
            localStorage.setItem(CALENDAR_KEY, JSON.stringify(state.calendar));
        } catch (e) {
            console.error('保存日历失败:', e);
        }
    }

    function getCalendar() {
        return state.calendar;
    }

    function updateCalendar(updates) {
        state.calendar = { ...state.calendar, ...updates };
        saveCalendar();
        return state.calendar;
    }

    function addDowntimePeriod(period) {
        const newPeriod = {
            id: Utils.generateUUID(),
            date: period.date,
            startMinute: period.startMinute || 480,
            endMinute: period.endMinute || 1080,
            reason: period.reason || ''
        };
        state.calendar.downtimePeriods.push(newPeriod);
        saveCalendar();
        return newPeriod;
    }

    function removeDowntimePeriod(id) {
        const index = state.calendar.downtimePeriods.findIndex(p => p.id === id);
        if (index !== -1) {
            state.calendar.downtimePeriods.splice(index, 1);
            saveCalendar();
            return true;
        }
        return false;
    }

    function isWorkDay(date) {
        const dayOfWeek = new Date(date).getDay();
        return state.calendar.workDays.includes(dayOfWeek);
    }

    function isDowntime(date, minuteOfDay = null) {
        const dateStr = typeof date === 'string' ? date : date.toISOString().split('T')[0];
        const checkTime = minuteOfDay !== null;
        
        for (const period of state.calendar.downtimePeriods) {
            if (dateStr === period.date) {
                if (!checkTime) return true;
                if (minuteOfDay >= period.startMinute && minuteOfDay <= period.endMinute) {
                    return true;
                }
            }
        }
        return false;
    }

    function getNextWorkDay(fromDate, daysToAdd = 1) {
        let current = new Date(fromDate);
        let added = 0;
        
        while (added < daysToAdd) {
            current.setDate(current.getDate() + 1);
            if (isWorkDay(current) && !isDowntime(current)) {
                added++;
            }
        }
        
        return current;
    }

    function getWorkDayOffset(fromDate, dayOffset) {
        let current = new Date(fromDate);
        let workDaysPassed = 0;
        
        while (workDaysPassed < dayOffset) {
            current.setDate(current.getDate() + 1);
            if (isWorkDay(current) && !isDowntime(current)) {
                workDaysPassed++;
            }
        }
        
        return current;
    }

    function loadFromStorage() {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const data = JSON.parse(stored);
                state.schemes = data.schemes || [];
                state.currentSchemeId = data.currentSchemeId || null;
                
                if (state.currentSchemeId) {
                    const current = state.schemes.find(s => s.id === state.currentSchemeId);
                    if (current) {
                        state.workOrders = Utils.deepClone(current.workOrders);
                    }
                }
            }
        } catch (e) {
            console.error('加载数据失败:', e);
        }
    }

    function saveToStorage() {
        try {
            const current = state.schemes.find(s => s.id === state.currentSchemeId);
            if (current) {
                current.workOrders = Utils.deepClone(state.workOrders);
                current.updatedAt = Date.now();
            }
            
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                schemes: state.schemes,
                currentSchemeId: state.currentSchemeId
            }));
        } catch (e) {
            console.error('保存数据失败:', e);
            Utils.showToast('保存失败', 'error');
        }
    }

    function migrateOrders() {
        let changed = false;
        state.workOrders.forEach(order => {
            if (!order.status) {
                if (!order.lineId) {
                    order.status = ORDER_STATUS.PENDING;
                } else {
                    order.status = ORDER_STATUS.SCHEDULED;
                }
                changed = true;
            }
        });
        if (changed) {
            saveToStorage();
        }
    }

    function createDemoData() {
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const dayAfter = new Date(today);
        dayAfter.setDate(dayAfter.getDate() + 2);
        const nextWeek = new Date(today);
        nextWeek.setDate(nextWeek.getDate() + 7);
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);

        const demoOrders = [
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-A001',
                quantity: 500,
                stdMinutes: 120,
                dueDate: tomorrow.toISOString().split('T')[0],
                lineId: 'lineA',
                startMinute: 480,
                dayOffset: 0,
                status: ORDER_STATUS.IN_PROGRESS,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-B002',
                quantity: 300,
                stdMinutes: 90,
                dueDate: tomorrow.toISOString().split('T')[0],
                lineId: 'lineA',
                startMinute: 600,
                dayOffset: 0,
                status: ORDER_STATUS.SCHEDULED,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-C003',
                quantity: 800,
                stdMinutes: 180,
                dueDate: dayAfter.toISOString().split('T')[0],
                lineId: 'lineB',
                startMinute: 480,
                dayOffset: 0,
                status: ORDER_STATUS.COMPLETED,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-D004',
                quantity: 200,
                stdMinutes: 60,
                dueDate: yesterday.toISOString().split('T')[0],
                lineId: 'lineC',
                startMinute: 540,
                dayOffset: 0,
                status: ORDER_STATUS.CANCELLED,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-E005',
                quantity: 450,
                stdMinutes: 150,
                dueDate: nextWeek.toISOString().split('T')[0],
                lineId: null,
                startMinute: null,
                status: ORDER_STATUS.PENDING,
                createdAt: Date.now()
            },
            {
                id: Utils.generateUUID(),
                productModel: 'XJ-F006',
                quantity: 1000,
                stdMinutes: 240,
                dueDate: dayAfter.toISOString().split('T')[0],
                lineId: null,
                startMinute: null,
                status: ORDER_STATUS.PENDING,
                createdAt: Date.now()
            }
        ];

        state.workOrders = demoOrders;
        
        const defaultScheme = {
            id: Utils.generateUUID(),
            name: '默认方案',
            workOrders: Utils.deepClone(demoOrders),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        state.schemes = [defaultScheme];
        state.currentSchemeId = defaultScheme.id;
        saveToStorage();
    }

    function getWorkOrders() {
        return state.workOrders;
    }

    function getWorkOrderById(id) {
        return state.workOrders.find(o => o.id === id);
    }

    function getOrdersByStatus(status) {
        return state.workOrders.filter(o => o.status === status);
    }

    function getUnscheduledOrders() {
        return state.workOrders.filter(o => o.status === ORDER_STATUS.PENDING);
    }

    function getScheduledOrders() {
        return state.workOrders.filter(o => 
            o.status === ORDER_STATUS.SCHEDULED || 
            o.status === ORDER_STATUS.IN_PROGRESS
        );
    }

    function getActiveOrders() {
        return state.workOrders.filter(o => 
            o.status !== ORDER_STATUS.COMPLETED && 
            o.status !== ORDER_STATUS.CANCELLED
        );
    }

    function getOrdersByLine(lineId) {
        return state.workOrders
            .filter(o => o.lineId === lineId && 
                o.status !== ORDER_STATUS.COMPLETED && 
                o.status !== ORDER_STATUS.CANCELLED)
            .sort((a, b) => {
                const dayA = a.dayOffset || 0;
                const dayB = b.dayOffset || 0;
                if (dayA !== dayB) return dayA - dayB;
                return a.startMinute - b.startMinute;
            });
    }

    function addWorkOrder(order) {
        let status = order.status;
        if (!status) {
            status = order.lineId ? ORDER_STATUS.SCHEDULED : ORDER_STATUS.PENDING;
        }

        const newOrder = {
            id: Utils.generateUUID(),
            productModel: order.productModel,
            quantity: parseInt(order.quantity),
            stdMinutes: parseInt(order.stdMinutes),
            dueDate: order.dueDate,
            lineId: order.lineId || null,
            startMinute: order.startMinute || null,
            dayOffset: order.lineId ? (order.dayOffset || 0) : null,
            status: status,
            segments: order.segments || null,
            createdAt: Date.now()
        };
        
        state.workOrders.push(newOrder);
        saveToStorage();
        return newOrder;
    }

    function updateWorkOrder(id, updates) {
        const index = state.workOrders.findIndex(o => o.id === id);
        if (index !== -1) {
            if (updates.lineId !== undefined) {
                if (updates.lineId && !updates.status) {
                    updates.status = ORDER_STATUS.SCHEDULED;
                } else if (!updates.lineId && !updates.status) {
                    updates.status = ORDER_STATUS.PENDING;
                    updates.startMinute = null;
                    updates.dayOffset = null;
                }
            }
            state.workOrders[index] = { ...state.workOrders[index], ...updates };
            saveToStorage();
            return state.workOrders[index];
        }
        return null;
    }

    function updateOrderStatus(id, newStatus) {
        const order = getWorkOrderById(id);
        if (!order) return null;

        const updates = { status: newStatus };
        
        if (newStatus === ORDER_STATUS.PENDING) {
            updates.lineId = null;
            updates.startMinute = null;
            updates.dayOffset = null;
            updates.segments = null;
        }
        
        return updateWorkOrder(id, updates);
    }

    function deleteWorkOrder(id) {
        const index = state.workOrders.findIndex(o => o.id === id);
        if (index !== -1) {
            state.workOrders.splice(index, 1);
            saveToStorage();
            return true;
        }
        return false;
    }

    function getLines() {
        return LINES;
    }

    function getLineById(id) {
        return LINES.find(l => l.id === id);
    }

    function getLineLoad(lineId) {
        const line = getLineById(lineId);
        if (!line) return 0;
        
        const orders = getOrdersByLine(lineId);
        const totalMinutes = orders.reduce((sum, o) => sum + o.stdMinutes, 0);
        const workDuration = line.workEndTime - line.workStartTime;
        
        return Math.min(totalMinutes / workDuration * 100, 100);
    }

    function getOverdueCount() {
        return state.workOrders.filter(o => 
            Utils.isOverdue(o.dueDate) && 
            o.status !== ORDER_STATUS.COMPLETED &&
            o.status !== ORDER_STATUS.CANCELLED
        ).length;
    }

    function getStatusCount(status) {
        return state.workOrders.filter(o => o.status === status).length;
    }

    function getStatusStats() {
        return {
            pending: getStatusCount(ORDER_STATUS.PENDING),
            scheduled: getStatusCount(ORDER_STATUS.SCHEDULED),
            in_progress: getStatusCount(ORDER_STATUS.IN_PROGRESS),
            completed: getStatusCount(ORDER_STATUS.COMPLETED),
            cancelled: getStatusCount(ORDER_STATUS.CANCELLED)
        };
    }

    function getAvgLoad() {
        const loads = LINES.map(l => getLineLoad(l.id));
        return loads.reduce((sum, l) => sum + l, 0) / LINES.length;
    }

    function getSchemes() {
        return state.schemes;
    }

    function getCurrentSchemeId() {
        return state.currentSchemeId;
    }

    function getCurrentScheme() {
        return state.schemes.find(s => s.id === state.currentSchemeId);
    }

    function loadScheme(schemeId) {
        const scheme = state.schemes.find(s => s.id === schemeId);
        if (scheme) {
            const current = state.schemes.find(s => s.id === state.currentSchemeId);
            if (current) {
                current.workOrders = Utils.deepClone(state.workOrders);
                current.updatedAt = Date.now();
            }
            
            state.currentSchemeId = schemeId;
            state.workOrders = Utils.deepClone(scheme.workOrders);
            saveToStorage();
            return true;
        }
        return false;
    }

    function saveScheme(name, asNew = false) {
        if (asNew || !state.currentSchemeId) {
            const newScheme = {
                id: Utils.generateUUID(),
                name: name,
                workOrders: Utils.deepClone(state.workOrders),
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            
            state.schemes.push(newScheme);
            state.currentSchemeId = newScheme.id;
            saveToStorage();
            return newScheme;
        }
        
        const scheme = state.schemes.find(s => s.id === state.currentSchemeId);
        if (scheme) {
            scheme.name = name;
            scheme.workOrders = Utils.deepClone(state.workOrders);
            scheme.updatedAt = Date.now();
            saveToStorage();
            return scheme;
        }
        
        const newScheme = {
            id: Utils.generateUUID(),
            name: name,
            workOrders: Utils.deepClone(state.workOrders),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        state.schemes.push(newScheme);
        state.currentSchemeId = newScheme.id;
        saveToStorage();
        return newScheme;
    }

    function copyScheme(sourceSchemeId, newName) {
        const sourceScheme = state.schemes.find(s => s.id === sourceSchemeId);
        if (!sourceScheme) return null;
        
        const newScheme = {
            id: Utils.generateUUID(),
            name: newName,
            workOrders: Utils.deepClone(sourceScheme.workOrders),
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        
        state.schemes.push(newScheme);
        saveToStorage();
        return newScheme;
    }

    function deleteScheme(schemeId) {
        const index = state.schemes.findIndex(s => s.id === schemeId);
        if (index !== -1) {
            state.schemes.splice(index, 1);
            if (state.currentSchemeId === schemeId) {
                state.currentSchemeId = state.schemes.length > 0 ? state.schemes[0].id : null;
                state.workOrders = state.currentSchemeId 
                    ? Utils.deepClone(state.schemes[0].workOrders) 
                    : [];
            }
            saveToStorage();
            return true;
        }
        return false;
    }

    function compareSchemes(schemeId1, schemeId2) {
        const scheme1 = state.schemes.find(s => s.id === schemeId1);
        const scheme2 = state.schemes.find(s => s.id === schemeId2);
        
        if (!scheme1 || !scheme2) return null;

        const result = {
            scheme1: { id: scheme1.id, name: scheme1.name },
            scheme2: { id: scheme2.id, name: scheme2.name },
            totalOrders: {
                scheme1: scheme1.workOrders.length,
                scheme2: scheme2.workOrders.length
            },
            lineComparison: {},
            movedOrders: [],
            addedOrders: [],
            removedOrders: [],
            statusChanges: []
        };

        LINES.forEach(line => {
            const lineOrders1 = scheme1.workOrders.filter(o => o.lineId === line.id);
            const lineOrders2 = scheme2.workOrders.filter(o => o.lineId === line.id);
            
            result.lineComparison[line.id] = {
                lineName: line.name,
                scheme1: {
                    count: lineOrders1.length,
                    load: calculateLoad(lineOrders1, line)
                },
                scheme2: {
                    count: lineOrders2.length,
                    load: calculateLoad(lineOrders2, line)
                }
            };
        });

        const orderMap1 = {};
        scheme1.workOrders.forEach(o => { orderMap1[o.id] = o; });
        
        const orderMap2 = {};
        scheme2.workOrders.forEach(o => { orderMap2[o.id] = o; });

        const allIds = new Set([...Object.keys(orderMap1), ...Object.keys(orderMap2)]);
        
        allIds.forEach(id => {
            const o1 = orderMap1[id];
            const o2 = orderMap2[id];
            
            if (o1 && o2) {
                const moved = (o1.lineId !== o2.lineId) || 
                              (o1.startMinute !== o2.startMinute) ||
                              (o1.dayOffset !== o2.dayOffset);
                
                if (moved) {
                    result.movedOrders.push({
                        id: id,
                        model: o1.productModel,
                        scheme1: { lineId: o1.lineId, startMinute: o1.startMinute, dayOffset: o1.dayOffset },
                        scheme2: { lineId: o2.lineId, startMinute: o2.startMinute, dayOffset: o2.dayOffset }
                    });
                }

                if (o1.status !== o2.status) {
                    result.statusChanges.push({
                        id: id,
                        model: o1.productModel,
                        scheme1: o1.status,
                        scheme2: o2.status
                    });
                }
            } else if (!o1 && o2) {
                result.addedOrders.push(o2);
            } else if (o1 && !o2) {
                result.removedOrders.push(o1);
            }
        });

        const stats1 = calculateStats(scheme1.workOrders);
        const stats2 = calculateStats(scheme2.workOrders);
        
        result.statsComparison = {
            scheme1: stats1,
            scheme2: stats2,
            overdueDiff: stats2.overdue - stats1.overdue,
            avgLoadDiff: stats2.avgLoad - stats1.avgLoad
        };

        return result;
    }

    function calculateLoad(orders, line) {
        const totalMinutes = orders.reduce((sum, o) => sum + o.stdMinutes, 0);
        const workDuration = line.workEndTime - line.workStartTime;
        return Math.min(totalMinutes / workDuration * 100, 100);
    }

    function calculateStats(orders) {
        const total = orders.length;
        const overdue = orders.filter(o => 
            Utils.isOverdue(o.dueDate) && 
            o.status !== ORDER_STATUS.COMPLETED &&
            o.status !== ORDER_STATUS.CANCELLED
        ).length;
        
        let totalLoad = 0;
        LINES.forEach(line => {
            const lineOrders = orders.filter(o => o.lineId === line.id);
            totalLoad += calculateLoad(lineOrders, line);
        });
        
        return {
            total,
            overdue,
            avgLoad: totalLoad / LINES.length
        };
    }

    function hasConflict(orderId, lineId, startMinute, duration, dayOffset = 0) {
        const WORK_START = state.calendar.workStartTime;
        const WORK_END = state.calendar.workEndTime;
        const WORK_PER_DAY = WORK_END - WORK_START;
        
        const newStartAbsolute = dayOffset * WORK_PER_DAY + (startMinute - WORK_START);
        const newEndAbsolute = newStartAbsolute + duration;
        
        const lineOrders = getOrdersByLine(lineId).filter(o => o.id !== orderId);
        
        for (const order of lineOrders) {
            const orderDay = order.dayOffset || 0;
            const orderStartAbsolute = orderDay * WORK_PER_DAY + (order.startMinute - WORK_START);
            const orderEndAbsolute = orderStartAbsolute + order.stdMinutes;
            
            if (newStartAbsolute < orderEndAbsolute && newEndAbsolute > orderStartAbsolute) {
                return true;
            }
        }
        return false;
    }

    function splitOrderForMultiDay(order, lineId, startMinute, dayOffset = 0) {
        const WORK_START = state.calendar.workStartTime;
        const WORK_END = state.calendar.workEndTime;
        const WORK_PER_DAY = WORK_END - WORK_START;
        
        const segments = [];
        let remainingMinutes = order.stdMinutes;
        let currentDay = dayOffset;
        let currentMinute = startMinute;
        
        while (remainingMinutes > 0) {
            const workDate = getWorkDayOffset(new Date(), currentDay);
            if (!isWorkDay(workDate) || isDowntime(workDate)) {
                currentDay++;
                continue;
            }
            
            const availableToday = WORK_END - currentMinute;
            const workToday = Math.min(remainingMinutes, availableToday);
            
            segments.push({
                dayOffset: currentDay,
                startMinute: currentMinute,
                duration: workToday,
                endMinute: currentMinute + workToday
            });
            
            remainingMinutes -= workToday;
            
            if (remainingMinutes > 0) {
                currentDay++;
                currentMinute = WORK_START;
            }
        }
        
        return segments;
    }

    return {
        init,
        getWorkOrders,
        getWorkOrderById,
        getUnscheduledOrders,
        getScheduledOrders,
        getActiveOrders,
        getOrdersByLine,
        getOrdersByStatus,
        getStatusCount,
        getStatusStats,
        addWorkOrder,
        updateWorkOrder,
        updateOrderStatus,
        deleteWorkOrder,
        getLines,
        getLineById,
        getLineLoad,
        getOverdueCount,
        getAvgLoad,
        getSchemes,
        getCurrentSchemeId,
        getCurrentScheme,
        loadScheme,
        saveScheme,
        copyScheme,
        deleteScheme,
        hasConflict,
        saveToStorage,
        compareSchemes,
        ORDER_STATUS,
        STATUS_LABELS,
        STATUS_COLORS,
        getCalendar,
        updateCalendar,
        addDowntimePeriod,
        removeDowntimePeriod,
        isWorkDay,
        isDowntime,
        getNextWorkDay,
        getWorkDayOffset,
        splitOrderForMultiDay
    };
})();
