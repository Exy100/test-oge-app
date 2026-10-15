n = int(input())
current = 0
best = 0
for i in range(n):
    x = int(input())
    if x >= -71:
        current += 1
        if current > best:
            best = current
    else:
        current = 0
print(best)
