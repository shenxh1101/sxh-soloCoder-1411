const Scheduler = (function() {
    const WORK_START_MINUTE = 480;
    const WORK_END_MINUTE = 1080;

    function autoSchedule(algorithm = 'edd') {
        const unscheduled = Store.getUnscheduledOrders();
        
        if (unscheduled.length === 0) {
            Utils.showToast('没有待排程的工单', 'warning');
            return 0;
        }
        
        const sortedOrders = sortOrders(unscheduled, algorithm);
        let scheduledCount = 0;
        
        sortedOrders.forEach(order => {
            const result = findBestSlot(order);
            if (result) {
                Store.updateWorkOrder(order.id, {
                    lineId: result.lineId,
                    startMinute: result.startMinute
                });
                scheduledCount++;
            }
        });
        
        return scheduledCount;
    }

    function sortOrders(orders, algorithm) {
        const sorted = [...orders];
        
        switch (algorithm) {
            case 'edd':
                sorted.sort((a, b) => {
                    const dateA = new Date(a.dueDate);
                    const dateB = new Date(b.dueDate);
                    return dateA - dateB;
                });
                break;
                
            case 'spt':
                sorted.sort((a, b) => a.stdMinutes - b.stdMinutes);
                break;
                
            default:
                break;
        }
        
        return sorted;
    }

    function findBestSlot(order) {
        const lines = Store.getLines();
        let bestSlot = null;
        let earliestEnd = Infinity;
        
        lines.forEach(line => {
            const slot = findEarliestSlot(order, line.id);
            if (slot !== null) {
                const endTime = slot + order.stdMinutes;
                if (endTime < earliestEnd) {
                    earliestEnd = endTime;
                    bestSlot = {
                        lineId: line.id,
                        startMinute: slot
                    };
                }
            }
        });
        
        return bestSlot;
    }

    function findEarliestSlot(order, lineId) {
        const line = Store.getLineById(lineId);
        if (!line) return null;
        
        const lineOrders = Store.getOrdersByLine(lineId).filter(o => o.id !== order.id);
        
        if (lineOrders.length === 0) {
            return line.workStartTime;
        }
        
        let candidateStart = line.workStartTime;
        
        lineOrders.sort((a, b) => a.startMinute - b.startMinute);
        
        for (const existing of lineOrders) {
            const existingEnd = existing.startMinute + existing.stdMinutes;
            
            if (candidateStart + order.stdMinutes <= existing.startMinute) {
                return candidateStart;
            }
            
            candidateStart = Math.max(candidateStart, existingEnd);
        }
        
        if (candidateStart + order.stdMinutes <= line.workEndTime) {
            return candidateStart;
        }
        
        return null;
    }

    function balanceLoad() {
        const lines = Store.getLines();
        const allScheduled = Store.getScheduledOrders();
        
        if (allScheduled.length === 0) return;
        
        const lineLoads = {};
        lines.forEach(line => {
            lineLoads[line.id] = Store.getLineLoad(line.id);
        });
        
        allScheduled.sort((a, b) => b.stdMinutes - a.stdMinutes);
        
        allScheduled.forEach(order => {
            let minLoadLine = null;
            let minLoad = Infinity;
            
            lines.forEach(line => {
                const slot = findEarliestSlot(order, line.id);
                if (slot !== null) {
                    const newLoad = lineLoads[line.id] + (order.stdMinutes / (line.workEndTime - line.workStartTime) * 100);
                    if (newLoad < minLoad) {
                        minLoad = newLoad;
                        minLoadLine = line.id;
                    }
                }
            });
            
            if (minLoadLine && minLoadLine !== order.lineId) {
                const slot = findEarliestSlot(order, minLoadLine);
                if (slot !== null) {
                    const oldLine = order.lineId;
                    Store.updateWorkOrder(order.id, {
                        lineId: minLoadLine,
                        startMinute: slot
                    });
                    
                    lineLoads[oldLine] -= (order.stdMinutes / (lines.find(l => l.id === oldLine).workEndTime - lines.find(l => l.id === oldLine).workStartTime) * 100);
                    lineLoads[minLoadLine] += (order.stdMinutes / (lines.find(l => l.id === minLoadLine).workEndTime - lines.find(l => l.id === minLoadLine).workStartTime) * 100);
                }
            }
        });
    }

    function rescheduleAll(algorithm = 'edd') {
        const allOrders = Store.getWorkOrders();
        
        allOrders.forEach(order => {
            Store.updateWorkOrder(order.id, {
                lineId: null,
                startMinute: null
            });
        });
        
        const count = autoSchedule(algorithm);
        
        return count;
    }

    return {
        autoSchedule,
        rescheduleAll,
        balanceLoad
    };
})();
