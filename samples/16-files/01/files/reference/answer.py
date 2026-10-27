n = int(input())
count = 0
total = 0
for i in range(n):
    x = int(input())
    if x > 0:
        count += 1
        total += x
print(total / count, count)
