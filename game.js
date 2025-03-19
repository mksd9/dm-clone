document.addEventListener('DOMContentLoaded', () => {
    // Game constants
    const GRID_COLS = 8;
    const GRID_ROWS = 16;
    const PILL_COLORS = ['red', 'yellow', 'blue'];
    const VIRUS_COUNT_INITIAL = 4; // Starting with fewer viruses for testing, increase this for a challenge
    const VIRUS_MAX = 84; // Maximum possible viruses in original game
    
    // Game elements
    const gameCanvas = document.getElementById('game-canvas');
    const ctx = gameCanvas.getContext('2d');
    const scoreElement = document.getElementById('score');
    const levelElement = document.getElementById('level');
    const virusCountElement = document.getElementById('virus-count');
    const startScreen = document.getElementById('start-screen');
    const gameOverScreen = document.getElementById('game-over-screen');
    
    // Game state
    let gameGrid = [];
    let score = 0;
    let level = 1;
    let virusCount = 0;
    let activePill = null;
    let gameState = 'start'; // 'start', 'playing', 'gameOver'
    let animationId = null;
    let lastTime = 0;
    let dropInterval = 1000; // milliseconds per drop
    let lastDropTime = 0;
    
    // Touch state
    let touchStartX = 0;
    let touchStartY = 0;
    let lastMoveDirection = null;
    let lastTapTime = 0;
    
    // Game objects
    class Block {
        constructor(x, y, color, isVirus = false) {
            this.x = x;
            this.y = y;
            this.color = color;
            this.isVirus = isVirus;
            this.isConnected = false; // For pills
            this.connectionDirection = null; // 'horizontal' or 'vertical'
        }
    }
    
    class Pill {
        constructor(x, y) {
            this.blocks = [
                new Block(x, y, PILL_COLORS[Math.floor(Math.random() * PILL_COLORS.length)]),
                new Block(x + 1, y, PILL_COLORS[Math.floor(Math.random() * PILL_COLORS.length)])
            ];
            this.blocks[0].isConnected = true;
            this.blocks[1].isConnected = true;
            this.blocks[0].connectionDirection = 'horizontal';
            this.blocks[1].connectionDirection = 'horizontal';
            this.rotation = 0; // 0: horizontal, 1: vertical, 2: horizontal flipped, 3: vertical flipped
        }
        
        rotate() {
            const [block1, block2] = this.blocks;
            
            // Save original position in case rotation is invalid
            const originalPositions = [
                { x: block1.x, y: block1.y },
                { x: block2.x, y: block2.y }
            ];
            
            const originalRotation = this.rotation;
            this.rotation = (this.rotation + 1) % 4;
            
            // Calculate new positions based on rotation
            let newX2, newY2;
            
            switch (this.rotation) {
                case 0: // Horizontal
                    newX2 = block1.x + 1;
                    newY2 = block1.y;
                    block1.connectionDirection = 'horizontal';
                    block2.connectionDirection = 'horizontal';
                    break;
                case 1: // Vertical
                    newX2 = block1.x;
                    newY2 = block1.y + 1;
                    block1.connectionDirection = 'vertical';
                    block2.connectionDirection = 'vertical';
                    break;
                case 2: // Horizontal flipped
                    newX2 = block1.x - 1;
                    newY2 = block1.y;
                    block1.connectionDirection = 'horizontal';
                    block2.connectionDirection = 'horizontal';
                    break;
                case 3: // Vertical flipped
                    newX2 = block1.x;
                    newY2 = block1.y - 1;
                    block1.connectionDirection = 'vertical';
                    block2.connectionDirection = 'vertical';
                    break;
            }
            
            // Check if rotation is valid
            if (newX2 < 0 || newX2 >= GRID_COLS || newY2 < 0 || newY2 >= GRID_ROWS || 
                (gameGrid[newY2] && gameGrid[newY2][newX2])) {
                // Revert rotation if invalid
                this.rotation = originalRotation;
                block1.x = originalPositions[0].x;
                block1.y = originalPositions[0].y;
                block2.x = originalPositions[1].x;
                block2.y = originalPositions[1].y;
                
                // Try wall kick (move one space away from wall if rotation would hit wall)
                if (newX2 < 0) {
                    this.moveRight();
                    this.rotate();
                } else if (newX2 >= GRID_COLS) {
                    this.moveLeft();
                    this.rotate();
                }
                
                return false;
            }
            
            // Apply new position
            block2.x = newX2;
            block2.y = newY2;
            
            return true;
        }
        
        moveLeft() {
            const [block1, block2] = this.blocks;
            
            // Check if move is valid
            if (block1.x <= 0 || block2.x <= 0 || 
                (gameGrid[block1.y] && gameGrid[block1.y][block1.x - 1]) || 
                (gameGrid[block2.y] && gameGrid[block2.y][block2.x - 1])) {
                return false;
            }
            
            block1.x--;
            block2.x--;
            return true;
        }
        
        moveRight() {
            const [block1, block2] = this.blocks;
            
            // Check if move is valid
            if (block1.x >= GRID_COLS - 1 || block2.x >= GRID_COLS - 1 || 
                (gameGrid[block1.y] && gameGrid[block1.y][block1.x + 1]) || 
                (gameGrid[block2.y] && gameGrid[block2.y][block2.x + 1])) {
                return false;
            }
            
            block1.x++;
            block2.x++;
            return true;
        }
        
        moveDown() {
            const [block1, block2] = this.blocks;
            
            // Check if move is valid
            if (block1.y >= GRID_ROWS - 1 || block2.y >= GRID_ROWS - 1 || 
                (gameGrid[block1.y + 1] && gameGrid[block1.y + 1][block1.x]) || 
                (gameGrid[block2.y + 1] && gameGrid[block2.y + 1][block2.x])) {
                return false;
            }
            
            block1.y++;
            block2.y++;
            return true;
        }
    }
    
    // Game initialization
    function initGame() {
        // Clear the game state
        gameGrid = Array(GRID_ROWS).fill().map(() => Array(GRID_COLS).fill(null));
        score = 0;
        virusCount = 0;
        
        // Reset UI
        scoreElement.textContent = score;
        levelElement.textContent = level;
        
        // Generate viruses
        const virusesToGenerate = Math.min(VIRUS_MAX, VIRUS_COUNT_INITIAL + (level - 1) * 4);
        generateViruses(virusesToGenerate);
        virusCountElement.textContent = virusCount;
        
        // Create first pill
        createNewPill();
        
        // Start game
        gameState = 'playing';
        startScreen.style.display = 'none';
        gameOverScreen.style.display = 'none';
        
        // Start game loop if not already running
        if (!animationId) {
            lastTime = performance.now();
            gameLoop(lastTime);
        }
    }
    
    function generateViruses(count) {
        virusCount = 0;
        
        // Clear existing viruses
        for (let y = 0; y < GRID_ROWS; y++) {
            for (let x = 0; x < GRID_COLS; x++) {
                if (gameGrid[y][x] && gameGrid[y][x].isVirus) {
                    gameGrid[y][x] = null;
                }
            }
        }
        
        // Only place viruses in the bottom 10 rows in the real game
        const maxVirusRow = GRID_ROWS - 1;
        const minVirusRow = Math.max(4, maxVirusRow - 10);
        
        // Place new viruses
        let i = 0;
        while (i < count) {
            const x = Math.floor(Math.random() * GRID_COLS);
            const y = Math.floor(Math.random() * (maxVirusRow - minVirusRow + 1)) + minVirusRow;
            
            if (!gameGrid[y][x]) {
                const color = PILL_COLORS[Math.floor(Math.random() * PILL_COLORS.length)];
                gameGrid[y][x] = new Block(x, y, color, true);
                virusCount++;
                i++;
            }
        }
    }
    
    function createNewPill() {
        // Start position is at the top-middle of the grid
        const x = Math.floor(GRID_COLS / 2) - 1;
        const y = 0;
        
        // Check if position is occupied (game over condition)
        if (gameGrid[y][x] || gameGrid[y][x + 1]) {
            gameState = 'gameOver';
            // Display final score
            const finalScoreElement = document.getElementById('final-score');
            if (finalScoreElement) {
                finalScoreElement.textContent = score;
            }
            gameOverScreen.style.display = 'flex';
            return;
        }
        
        activePill = new Pill(x, y);
    }
    
    function placePill() {
        const [block1, block2] = activePill.blocks;
        
        // Add blocks to grid
        if (!gameGrid[block1.y]) gameGrid[block1.y] = Array(GRID_COLS).fill(null);
        if (!gameGrid[block2.y]) gameGrid[block2.y] = Array(GRID_COLS).fill(null);
        
        gameGrid[block1.y][block1.x] = block1;
        gameGrid[block2.y][block2.x] = block2;
        
        // Check for matches
        checkMatches();
        
        // Create next pill
        if (gameState === 'playing') {
            createNewPill();
        }
    }
    
    function checkMatches() {
        let matchFound = false;
        const blocksToRemove = new Set();
        
        // Check horizontal matches
        for (let y = 0; y < GRID_ROWS; y++) {
            let currentColor = null;
            let matchLength = 0;
            let matchStart = -1;
            
            for (let x = 0; x < GRID_COLS; x++) {
                const block = gameGrid[y] && gameGrid[y][x];
                
                if (block && block.color === currentColor) {
                    matchLength++;
                } else {
                    if (matchLength >= 4) {
                        // Found a match of 4 or more (original Dr. Mario only required 4)
                        for (let i = matchStart; i < x; i++) {
                            blocksToRemove.add(`${y},${i}`);
                        }
                        matchFound = true;
                    }
                    
                    // Reset match tracking
                    if (block) {
                        currentColor = block.color;
                        matchLength = 1;
                        matchStart = x;
                    } else {
                        currentColor = null;
                        matchLength = 0;
                        matchStart = -1;
                    }
                }
            }
            
            // Check match at end of row
            if (matchLength >= 4) {
                for (let i = matchStart; i < GRID_COLS; i++) {
                    blocksToRemove.add(`${y},${i}`);
                }
                matchFound = true;
            }
        }
        
        // Check vertical matches
        for (let x = 0; x < GRID_COLS; x++) {
            let currentColor = null;
            let matchLength = 0;
            let matchStart = -1;
            
            for (let y = 0; y < GRID_ROWS; y++) {
                const block = gameGrid[y] && gameGrid[y][x];
                
                if (block && block.color === currentColor) {
                    matchLength++;
                } else {
                    if (matchLength >= 4) {
                        // Found a match of 4 or more (original Dr. Mario only required 4)
                        for (let i = matchStart; i < y; i++) {
                            blocksToRemove.add(`${i},${x}`);
                        }
                        matchFound = true;
                    }
                    
                    // Reset match tracking
                    if (block) {
                        currentColor = block.color;
                        matchLength = 1;
                        matchStart = y;
                    } else {
                        currentColor = null;
                        matchLength = 0;
                        matchStart = -1;
                    }
                }
            }
            
            // Check match at end of column
            if (matchLength >= 4) {
                for (let i = matchStart; i < GRID_ROWS; i++) {
                    blocksToRemove.add(`${i},${x}`);
                }
                matchFound = true;
            }
        }
        
        // Remove matched blocks and update score
        if (blocksToRemove.size > 0) {
            for (const pos of blocksToRemove) {
                const [y, x] = pos.split(',').map(Number);
                
                if (gameGrid[y] && gameGrid[y][x]) {
                    // Add score based on whether the block was a virus
                    if (gameGrid[y][x].isVirus) {
                        score += 100;
                        virusCount--;
                    } else {
                        score += 10;
                    }
                    
                    // Remove the block
                    gameGrid[y][x] = null;
                }
            }
            
            // Update UI
            scoreElement.textContent = score;
            virusCountElement.textContent = virusCount;
            
            // Check for win condition
            if (virusCount <= 0) {
                level++;
                levelElement.textContent = level;
                initGame(); // Start next level
                return;
            }
            
            // Apply gravity to blocks after removal
            applyGravity();
            
            // Recursively check for more matches
            setTimeout(checkMatches, 300);
            return;
        }
        
        // If no matches found, continue the game
        if (!matchFound) {
            // Create new pill if game is still active
            if (gameState === 'playing') {
                createNewPill();
            }
        }
    }
    
    function applyGravity() {
        let blocksFell = false;
        
        // Loop through grid from bottom to top
        for (let y = GRID_ROWS - 2; y >= 0; y--) {
            for (let x = 0; x < GRID_COLS; x++) {
                const block = gameGrid[y] && gameGrid[y][x];
                
                if (block && !block.isVirus) {
                    // Check if this block is connected to another
                    if (block.isConnected) {
                        // Find connected block
                        let connectedX, connectedY;
                        
                        if (block.connectionDirection === 'horizontal') {
                            connectedX = x + (x > 0 && gameGrid[y][x-1] && gameGrid[y][x-1].isConnected ? -1 : 1);
                            connectedY = y;
                        } else { // vertical
                            connectedX = x;
                            connectedY = y + (y > 0 && gameGrid[y-1][x] && gameGrid[y-1][x].isConnected ? -1 : 1);
                        }
                        
                        const connectedBlock = gameGrid[connectedY] && gameGrid[connectedY][connectedX];
                        
                        // If connected horizontally, check if both can fall
                        if (block.connectionDirection === 'horizontal' && connectedBlock) {
                            const canFall = 
                                y < GRID_ROWS - 1 && 
                                (!gameGrid[y+1][x] || gameGrid[y+1][x] === null) && 
                                (!gameGrid[y+1][connectedX] || gameGrid[y+1][connectedX] === null);
                            
                            if (canFall) {
                                // Move both blocks down
                                gameGrid[y+1][x] = block;
                                gameGrid[y+1][connectedX] = connectedBlock;
                                gameGrid[y][x] = null;
                                gameGrid[y][connectedX] = null;
                                
                                // Update block positions
                                block.y = y + 1;
                                connectedBlock.y = y + 1;
                                
                                blocksFell = true;
                            }
                        }
                        // If connected vertically, only the bottom one needs checking
                        else if (block.connectionDirection === 'vertical' && 
                                connectedY > y && // We're the top block
                                connectedBlock) {
                            // Check if bottom block can fall
                            const canFall = 
                                connectedY < GRID_ROWS - 1 && 
                                (!gameGrid[connectedY+1][connectedX] || gameGrid[connectedY+1][connectedX] === null);
                            
                            if (canFall) {
                                // Move both blocks down
                                gameGrid[y+1][x] = block;
                                gameGrid[connectedY+1][connectedX] = connectedBlock;
                                gameGrid[y][x] = null;
                                gameGrid[connectedY][connectedX] = null;
                                
                                // Update block positions
                                block.y = y + 1;
                                connectedBlock.y = connectedY + 1;
                                
                                blocksFell = true;
                            }
                        }
                        // Check if a vertical pair is no longer connected
                        else if (block.connectionDirection === 'vertical' && !connectedBlock) {
                            // Make this block a single block
                            block.isConnected = false;
                            block.connectionDirection = null;
                            
                            // Check if it can fall
                            const canFall = 
                                y < GRID_ROWS - 1 && 
                                (!gameGrid[y+1][x] || gameGrid[y+1][x] === null);
                            
                            if (canFall) {
                                gameGrid[y+1][x] = block;
                                gameGrid[y][x] = null;
                                block.y = y + 1;
                                blocksFell = true;
                            }
                        }
                    }
                    // Single block
                    else {
                        const canFall = 
                            y < GRID_ROWS - 1 && 
                            (!gameGrid[y+1][x] || gameGrid[y+1][x] === null);
                        
                        if (canFall) {
                            gameGrid[y+1][x] = block;
                            gameGrid[y][x] = null;
                            block.y = y + 1;
                            blocksFell = true;
                        }
                    }
                }
            }
        }
        
        // If any blocks fell, apply gravity again after a short delay
        if (blocksFell) {
            setTimeout(applyGravity, 100);
        }
    }
    
    // Rendering
    function render() {
        // Calculate canvas size to fit the container while maintaining aspect ratio
        const containerWidth = gameCanvas.parentElement.clientWidth;
        const containerHeight = gameCanvas.parentElement.clientHeight;
        
        // Calculate cell size based on container dimensions
        const cellWidth = containerWidth / GRID_COLS;
        const cellHeight = containerHeight / GRID_ROWS;
        const cellSize = Math.min(cellWidth, cellHeight);
        
        // Set canvas size
        const canvasWidth = cellSize * GRID_COLS;
        const canvasHeight = cellSize * GRID_ROWS;
        
        // Only resize if dimensions have changed
        if (gameCanvas.width !== canvasWidth || gameCanvas.height !== canvasHeight) {
            gameCanvas.width = canvasWidth;
            gameCanvas.height = canvasHeight;
        }
        
        // Clear canvas
        ctx.clearRect(0, 0, gameCanvas.width, gameCanvas.height);
        
        // Draw grid background
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, gameCanvas.width, gameCanvas.height);
        
        // Draw grid lines
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 1;
        
        // Draw vertical lines
        for (let x = 0; x <= GRID_COLS; x++) {
            ctx.beginPath();
            ctx.moveTo(x * cellSize, 0);
            ctx.lineTo(x * cellSize, gameCanvas.height);
            ctx.stroke();
        }
        
        // Draw horizontal lines
        for (let y = 0; y <= GRID_ROWS; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y * cellSize);
            ctx.lineTo(gameCanvas.width, y * cellSize);
            ctx.stroke();
        }
        
        // Draw blocks in grid
        for (let y = 0; y < GRID_ROWS; y++) {
            for (let x = 0; x < GRID_COLS; x++) {
                const block = gameGrid[y] && gameGrid[y][x];
                
                if (block) {
                    drawBlock(x, y, block.color, block.isVirus, cellSize);
                }
            }
        }
        
        // Draw active pill
        if (activePill && gameState === 'playing') {
            for (const block of activePill.blocks) {
                drawBlock(block.x, block.y, block.color, false, cellSize);
            }
        }
    }
    
    function drawBlock(x, y, color, isVirus, cellSize) {
        const padding = Math.max(1, cellSize * 0.05);
        
        // Block base color
        ctx.fillStyle = getBlockColor(color);
        
        if (isVirus) {
            // Draw virus
            const centerX = x * cellSize + cellSize / 2;
            const centerY = y * cellSize + cellSize / 2;
            const radius = cellSize / 2 - padding * 2;
            
            // Body
            ctx.beginPath();
            ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Eyes
            ctx.fillStyle = 'white';
            const eyeRadius = radius * 0.2;
            ctx.beginPath();
            ctx.arc(centerX - radius * 0.3, centerY - radius * 0.2, eyeRadius, 0, Math.PI * 2);
            ctx.arc(centerX + radius * 0.3, centerY - radius * 0.2, eyeRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Pupils
            ctx.fillStyle = 'black';
            const pupilRadius = eyeRadius * 0.6;
            ctx.beginPath();
            ctx.arc(centerX - radius * 0.3, centerY - radius * 0.2, pupilRadius, 0, Math.PI * 2);
            ctx.arc(centerX + radius * 0.3, centerY - radius * 0.2, pupilRadius, 0, Math.PI * 2);
            ctx.fill();
            
            // Mouth
            ctx.strokeStyle = 'black';
            ctx.lineWidth = Math.max(1, radius * 0.1);
            ctx.beginPath();
            ctx.arc(centerX, centerY + radius * 0.2, radius * 0.4, 0.1 * Math.PI, 0.9 * Math.PI);
            ctx.stroke();
        } else {
            // Draw pill capsule
            ctx.fillRect(
                x * cellSize + padding,
                y * cellSize + padding,
                cellSize - padding * 2,
                cellSize - padding * 2
            );
            
            // Add highlight
            ctx.fillStyle = getLightColor(color);
            ctx.fillRect(
                x * cellSize + padding * 3,
                y * cellSize + padding * 3,
                (cellSize - padding * 6) / 2,
                (cellSize - padding * 6) / 2
            );
        }
    }
    
    function getBlockColor(color) {
        switch (color) {
            case 'red': return '#ff4444';
            case 'yellow': return '#ffcc44';
            case 'blue': return '#4444ff';
            default: return '#ffffff';
        }
    }
    
    function getLightColor(color) {
        switch (color) {
            case 'red': return '#ff8888';
            case 'yellow': return '#ffee88';
            case 'blue': return '#8888ff';
            default: return '#ffffff';
        }
    }
    
    // Game loop
    function gameLoop(timestamp) {
        const deltaTime = timestamp - lastTime;
        lastTime = timestamp;
        
        if (gameState === 'playing') {
            // Update game state
            update(deltaTime);
        }
        
        // Render
        render();
        
        // Continue the game loop
        animationId = requestAnimationFrame(gameLoop);
    }
    
    function update(deltaTime) {
        // Move active pill down at regular intervals
        lastDropTime += deltaTime;
        
        if (lastDropTime > dropInterval) {
            lastDropTime = 0;
            
            if (activePill) {
                const moved = activePill.moveDown();
                
                // If pill couldn't move down, place it on the grid
                if (!moved) {
                    placePill();
                }
            }
        }
    }
    
    // Input handling
    gameCanvas.addEventListener('touchstart', handleTouchStart);
    gameCanvas.addEventListener('touchmove', handleTouchMove);
    gameCanvas.addEventListener('touchend', handleTouchEnd);
    
    // For start/game over screens
    startScreen.addEventListener('touchstart', startGame);
    gameOverScreen.addEventListener('touchstart', startGame);
    
    function startGame(e) {
        e.preventDefault();
        initGame();
    }
    
    function handleTouchStart(e) {
        e.preventDefault();
        
        if (gameState !== 'playing') return;
        
        const touch = e.touches[0];
        touchStartX = touch.clientX;
        touchStartY = touch.clientY;
        lastMoveDirection = null;
        
        // Double tap detection for rotation
        const now = Date.now();
        const timeSinceLastTap = now - lastTapTime;
        
        if (timeSinceLastTap < 300) { // Double tap threshold (300ms)
            if (activePill) {
                activePill.rotate();
            }
        }
        
        lastTapTime = now;
    }
    
    function handleTouchMove(e) {
        e.preventDefault();
        
        if (gameState !== 'playing' || !activePill) return;
        
        const touch = e.touches[0];
        const diffX = touch.clientX - touchStartX;
        const diffY = touch.clientY - touchStartY;
        const threshold = 20; // Minimum swipe distance
        
        // Determine swipe direction
        if (Math.abs(diffX) > Math.abs(diffY)) {
            // Horizontal swipe
            if (diffX > threshold && lastMoveDirection !== 'right') {
                activePill.moveRight();
                lastMoveDirection = 'right';
                touchStartX = touch.clientX;
            } else if (diffX < -threshold && lastMoveDirection !== 'left') {
                activePill.moveLeft();
                lastMoveDirection = 'left';
                touchStartX = touch.clientX;
            }
        } else {
            // Vertical swipe (down only)
            if (diffY > threshold && lastMoveDirection !== 'down') {
                // Quick drop on downward swipe
                while (activePill.moveDown()) {
                    // Keep moving down until blocked
                }
                placePill();
                
                lastMoveDirection = 'down';
                touchStartY = touch.clientY;
            }
        }
    }
    
    function handleTouchEnd(e) {
        e.preventDefault();
        lastMoveDirection = null;
    }
    
    // Initialize canvas size
    function resizeCanvas() {
        render();
    }
    
    // Handle window resize
    window.addEventListener('resize', resizeCanvas);
    
    // Initialize the game on load
    resizeCanvas();
    
    // Show start screen
    gameState = 'start';
    startScreen.style.display = 'flex';
}); 