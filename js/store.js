const Store = (function() {
    const STORAGE_KEY = 'workOrderSchedules';
    const CURRENT_SCHEME_KEY = 'currentScheduleScheme';
    
    const LINES = [
        { id: 'lineA', name: 'A线', color: '#00d4ff', workStartTime: 480, workEndTime: 1080 },
        { id: 'lineB', name: 'B线', color: '#ff9500', workStartTime: 480, workEndTime: 1080 },
        { id: 'lineC', name: 'C线', color: '#34c759', workStartTime: 480, workEndTime: 1080 }
    ];

    let state = {
        workOrders: [],
        currentSchemeId: null,
        schemes: []
    };

    function init() {
        loadFromStorage();
        if (state.schemes.length === 0) {
            createDemoData();
        }
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

    function getUnscheduledOrders() {
        return state.workOrders.filter(o => !o.lineId);
    }

    function getScheduledOrders() {
        return state.workOrders.filter(o => o.lineId);
    }

    function getOrdersByLine(lineId) {
        return state.workOrders.filter(o => o.lineId === lineId).sort((a, b) => {
            const dayA = a.dayOffset || 0;
            const dayB = b.dayOffset || 0;
            if (dayA !== dayB) return dayA - dayB;
            return a.startMinute - b.startMinute;
        });
    }

    function addWorkOrder(order) {
        const newOrder = {
            id: Utils.generateUUID(),
            productModel: order.productModel,
            quantity: parseInt(order.quantity),
            stdMinutes: parseInt(order.stdMinutes),
            dueDate: order.dueDate,
            lineId: order.lineId || null,
            startMinute: order.startMinute || null,
            dayOffset: order.lineId ? (order.dayOffset || 0) : null,
            createdAt: Date.now()
        };
        
        state.workOrders.push(newOrder);
        saveToStorage();
        return newOrder;
    }

    function updateWorkOrder(id, updates) {
        const index = state.workOrders.findIndex(o => o.id === id);
        if (index !== -1) {
            state.workOrders[index] = { ...state.workOrders[index], ...updates };
            saveToStorage();
            return state.workOrders[index];
        }
        return null;
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
        return state.workOrders.filter(o => Utils.isOverdue(o.dueDate)).length;
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

    function hasConflict(orderId, lineId, startMinute, duration, dayOffset = 0) {
        const WORK_START = 480;
        const WORK_END = 1080;
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

    return {
        init,
        getWorkOrders,
        getWorkOrderById,
        getUnscheduledOrders,
        getScheduledOrders,
        getOrdersByLine,
        addWorkOrder,
        updateWorkOrder,
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
        saveToStorage
    };
})();
