n = int(input())
count = 0
total = 0
for i in range(n):
    x = int(input())
    if x % 7 == 0 and x >= 42:
        count += 1
        total += x
print(count, total)
